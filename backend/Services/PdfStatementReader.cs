using System.Text;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace Admin.Api.Services;

/// <summary>
/// Turns a bank statement PDF into the same rectangular grid of text cells that the CSV and .xlsx
/// imports produce, so <c>BankStatementParser</c> in the KeshavSingh.Finance package still does all the
/// date/amount normalisation. Nothing here understands money — it only recovers the table.
///
/// A PDF has no columns, only glyphs at coordinates, so the table is rebuilt in three steps: group words
/// into lines by their baseline, split each line into cells wherever the horizontal gap is much wider
/// than an ordinary word space, then snap those cells onto the column positions that repeat down the
/// page. Wrapped narration lines therefore stay in the description column instead of shifting the row.
///
/// The password (most bank statements are protected with a DOB/PAN) is used and discarded: it is never
/// stored, never logged, and never written to a temp file. The file itself is only ever in memory.
/// </summary>
public static class PdfStatementReader
{
    /// <summary>Cap on pages read — a statement is tens of pages; anything more is not a statement.</summary>
    public const int MaxPages = 200;

    /// <summary>Cap on emitted rows, so one pathological file can't exhaust memory.</summary>
    public const int MaxRows = 20_000;

    /// <summary>Widest gap still treated as a word space rather than a column break, in points.</summary>
    private const double MinColumnGap = 4.0;
    private const double MaxColumnGap = 30.0;

    /// <summary>How far apart two cell starts can be and still count as the same column, in points.</summary>
    private const double ColumnSnapTolerance = 9.0;

    public sealed record PdfGrid(IReadOnlyList<IReadOnlyList<string>> Rows, int Pages, bool Truncated)
    {
        public int Columns => Rows.Count == 0 ? 0 : Rows[0].Count;
    }

    /// <summary>
    /// Reads <paramref name="pdf"/> into a grid. Throws <see cref="UglyToad.PdfPig.Exceptions.PdfDocumentEncryptedException"/>
    /// when the password is missing or wrong, and <see cref="InvalidDataException"/> when the file has no
    /// extractable text at all (a scanned statement, which would need OCR).
    /// </summary>
    public static PdfGrid Read(Stream pdf, string? password)
    {
        ArgumentNullException.ThrowIfNull(pdf);

        // PdfPig needs random access; an uploaded stream may not be seekable. The size is already
        // bounded by the endpoint's request limit, so buffering is safe.
        using var buffer = new MemoryStream();
        pdf.CopyTo(buffer);
        buffer.Position = 0;

        var options = new ParsingOptions
        {
            // A wrong/absent password throws PdfDocumentEncryptedException, which the caller maps to 400.
            Password = password ?? string.Empty,
            UseLenientParsing = true,
            SkipMissingFonts = true,
        };

        using var document = PdfDocument.Open(buffer, options);

        var pages = Math.Min(document.NumberOfPages, MaxPages);
        var lines = new List<List<Cell>>();
        var gaps = new List<double>();

        for (var pageNumber = 1; pageNumber <= pages; pageNumber++)
        {
            var words = document.GetPage(pageNumber).GetWords()
                .Where(w => w.TextOrientation == TextOrientation.Horizontal && !string.IsNullOrWhiteSpace(w.Text))
                .ToList();
            if (words.Count == 0) continue;

            foreach (var line in GroupIntoLines(words))
            {
                for (var i = 1; i < line.Count; i++)
                {
                    var gap = line[i].BoundingBox.Left - line[i - 1].BoundingBox.Right;
                    if (gap > 0) gaps.Add(gap);
                }
                lines.Add(line
                    .Select(w => new Cell(w.BoundingBox.Left, w.BoundingBox.Right, Clean(w.Text)))
                    .ToList());
            }
        }

        if (lines.Count == 0)
            throw new InvalidDataException("The PDF has no extractable text.");

        // One threshold for the whole document: most gaps are ordinary word spaces, so a multiple of
        // the median separates "space" from "next column" far more reliably than any per-line guess.
        var threshold = Math.Clamp(Median(gaps) * 3.0, MinColumnGap, MaxColumnGap);
        var split = lines.Select(line => SplitIntoCells(line, threshold)).ToList();

        var boundaries = ColumnBoundaries(split);
        var rows = split
            .Select(cells => Snap(cells, boundaries))
            .Where(row => row.Any(cell => cell.Length > 0))
            .Take(MaxRows)
            .ToList();

        return new PdfGrid(rows, pages, split.Count > rows.Count || document.NumberOfPages > pages);
    }

    /// <summary>Words sharing a baseline (within half a line height) are one visual line, left to right.</summary>
    private static List<List<Word>> GroupIntoLines(List<Word> words)
    {
        // PDF coordinates start at the bottom-left, so reading order is descending Y.
        var ordered = words
            .OrderByDescending(w => w.BoundingBox.Bottom)
            .ThenBy(w => w.BoundingBox.Left)
            .ToList();

        var tolerance = Math.Max(2.0, Median(words.Select(w => w.BoundingBox.Height).ToList()) * 0.5);
        var lines = new List<List<Word>>();
        var current = new List<Word> { ordered[0] };
        var baseline = ordered[0].BoundingBox.Bottom;

        foreach (var word in ordered.Skip(1))
        {
            if (Math.Abs(word.BoundingBox.Bottom - baseline) <= tolerance)
            {
                current.Add(word);
                continue;
            }
            lines.Add([.. current.OrderBy(w => w.BoundingBox.Left)]);
            current = [word];
            baseline = word.BoundingBox.Bottom;
        }
        lines.Add([.. current.OrderBy(w => w.BoundingBox.Left)]);
        return lines;
    }

    /// <summary>Joins words into cells, breaking wherever the gap is wider than a word space.</summary>
    private static List<Cell> SplitIntoCells(List<Cell> words, double threshold)
    {
        var cells = new List<Cell>();
        var text = new StringBuilder(words[0].Text);
        var left = words[0].Left;
        var right = words[0].Right;

        foreach (var word in words.Skip(1))
        {
            if (word.Left - right > threshold)
            {
                cells.Add(new Cell(left, right, text.ToString()));
                text.Clear().Append(word.Text);
                left = word.Left;
            }
            else
            {
                text.Append(' ').Append(word.Text);
            }
            right = word.Right;
        }

        cells.Add(new Cell(left, right, text.ToString()));
        return cells;
    }

    /// <summary>
    /// The x positions where cells repeatedly start are the table's columns. Positions seen on only a
    /// handful of lines are stray (a footer, a stamp) and get folded into the nearest real column.
    /// </summary>
    private static List<double> ColumnBoundaries(List<List<Cell>> lines)
    {
        var lefts = lines.SelectMany(cells => cells.Select(c => c.Left)).OrderBy(x => x).ToList();
        var clusters = new List<(double Left, int Count)>();

        foreach (var x in lefts)
        {
            if (clusters.Count > 0 && x - clusters[^1].Left <= ColumnSnapTolerance)
            {
                clusters[^1] = (clusters[^1].Left, clusters[^1].Count + 1);
                continue;
            }
            clusters.Add((x, 1));
        }

        // A real column shows up on a good share of the lines; 15% keeps columns that only appear on
        // transaction rows (not on headers or totals) while dropping one-off positions.
        var minimum = Math.Max(2, (int)(lines.Count * 0.15));
        var columns = clusters.Where(c => c.Count >= minimum).Select(c => c.Left).ToList();
        return columns.Count > 0 ? columns : clusters.Select(c => c.Left).ToList();
    }

    /// <summary>Places each cell in its column; cells landing in the same column are joined.</summary>
    private static IReadOnlyList<string> Snap(List<Cell> cells, List<double> boundaries)
    {
        var row = new string[boundaries.Count];

        foreach (var cell in cells)
        {
            var index = NearestColumn(cell.Left, boundaries);
            row[index] = string.IsNullOrEmpty(row[index]) ? cell.Text : $"{row[index]} {cell.Text}";
        }

        for (var i = 0; i < row.Length; i++) row[i] ??= string.Empty;
        return row;
    }

    private static int NearestColumn(double left, List<double> boundaries)
    {
        var best = 0;
        var bestDistance = double.MaxValue;
        for (var i = 0; i < boundaries.Count; i++)
        {
            var distance = Math.Abs(boundaries[i] - left);
            if (distance >= bestDistance) continue;
            bestDistance = distance;
            best = i;
        }
        return best;
    }

    private static double Median(IReadOnlyList<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        return sorted[sorted.Count / 2];
    }

    /// <summary>Collapses whitespace and drops control characters, so a cell is one clean line.</summary>
    private static string Clean(string text)
    {
        var sb = new StringBuilder(text.Length);
        var lastWasSpace = false;
        foreach (var ch in text)
        {
            if (char.IsControl(ch) || char.IsWhiteSpace(ch))
            {
                if (!lastWasSpace && sb.Length > 0) sb.Append(' ');
                lastWasSpace = true;
                continue;
            }
            sb.Append(ch);
            lastWasSpace = false;
        }
        return sb.ToString().Trim();
    }

    private readonly record struct Cell(double Left, double Right, string Text);
}
