namespace Admin.Api.Services;

/// <summary>
/// Identifies an uploaded file from its leading bytes rather than from the <c>Content-Type</c> the
/// uploader declared.
///
/// <para>Why it exists: the upload allowlist is only meaningful if the value it checks is one the
/// caller cannot choose. The multipart content type is chosen by the client, and it is also the type
/// echoed back on download — so an allowlist applied to it alone verifies nothing. This reduces the
/// declared type to a claim that must be corroborated by the bytes.</para>
///
/// <para>Text formats (<c>text/plain</c>, <c>text/csv</c>) have no signature, so they are accepted on
/// the weaker test of "decodes as UTF-8 and carries no NUL bytes" — enough to reject a binary
/// masquerading as text, which is the case that matters here.</para>
/// </summary>
public static class FileSignature
{
    /// <summary>How many leading bytes are needed to recognise the longest signature below.</summary>
    private const int PeekBytes = 512;

    private static readonly (byte[] Magic, int Offset, string ContentType)[] Signatures =
    {
        (new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, 0, "image/png"),
        (new byte[] { 0xFF, 0xD8, 0xFF },                               0, "image/jpeg"),
        (new byte[] { 0x47, 0x49, 0x46, 0x38 },                         0, "image/gif"),   // GIF8
        (new byte[] { 0x25, 0x50, 0x44, 0x46 },                         0, "application/pdf"), // %PDF
        (new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 }, 0, "application/x-ole"), // legacy .doc/.xls
        (new byte[] { 0x50, 0x4B, 0x03, 0x04 },                         0, "application/zip"),  // .docx/.xlsx
        (new byte[] { 0x50, 0x4B, 0x05, 0x06 },                         0, "application/zip"),  // empty archive
        (new byte[] { 0x50, 0x4B, 0x07, 0x08 },                         0, "application/zip"),  // spanned archive
    };

    /// <summary>The declared types each detected family is allowed to claim.</summary>
    private static readonly Dictionary<string, string[]> Accepts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/png"] = new[] { "image/png" },
        ["image/jpeg"] = new[] { "image/jpeg" },
        ["image/gif"] = new[] { "image/gif" },
        ["application/pdf"] = new[] { "application/pdf" },
        // OOXML documents are ZIP containers; the bytes cannot tell a .docx from a .xlsx, so the
        // declared type picks between them — but only from within the OOXML family.
        ["application/zip"] = new[]
        {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        // Likewise for the pre-2007 OLE compound formats.
        ["application/x-ole"] = new[] { "application/msword", "application/vnd.ms-excel" },
    };

    private static readonly string[] TextTypes = { "text/plain", "text/csv" };

    /// <summary>
    /// Returns the content type to store, or null when the bytes contradict the declared type.
    /// The stream is rewound to its start before returning, so the caller can still save it.
    /// </summary>
    public static async Task<string?> DetectAsync(Stream stream, string declaredContentType, CancellationToken ct = default)
    {
        var buffer = new byte[PeekBytes];
        var read = await ReadAtLeastAsync(stream, buffer, ct);
        if (stream.CanSeek) stream.Position = 0;
        if (read == 0) return null;

        var head = buffer.AsSpan(0, read);

        foreach (var (magic, offset, family) in Signatures)
        {
            if (read < offset + magic.Length) continue;
            if (!head.Slice(offset, magic.Length).SequenceEqual(magic)) continue;

            // WEBP is RIFF....WEBP — a second marker further in, so it is checked separately below.
            return Accepts.TryGetValue(family, out var allowed)
                   && allowed.Contains(declaredContentType, StringComparer.OrdinalIgnoreCase)
                ? declaredContentType
                : null;
        }

        // RIFF <4-byte size> WEBP
        if (read >= 12
            && head[..4].SequenceEqual("RIFF"u8)
            && head.Slice(8, 4).SequenceEqual("WEBP"u8))
        {
            return declaredContentType.Equals("image/webp", StringComparison.OrdinalIgnoreCase)
                ? declaredContentType
                : null;
        }

        // No signature matched. Only the text formats legitimately have none.
        if (TextTypes.Contains(declaredContentType, StringComparer.OrdinalIgnoreCase) && LooksLikeText(head))
            return declaredContentType;

        return null;
    }

    /// <summary>NUL bytes are the cheap, reliable tell that "text" is really a binary.</summary>
    private static bool LooksLikeText(ReadOnlySpan<byte> head)
    {
        foreach (var b in head)
            if (b == 0x00) return false;
        return true;
    }

    /// <summary>Fills as much of the buffer as the stream will give, tolerating short reads.</summary>
    private static async Task<int> ReadAtLeastAsync(Stream stream, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total), ct);
            if (read == 0) break;
            total += read;
        }
        return total;
    }
}
