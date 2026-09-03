using Admin.Api.Services;
using Xunit;

namespace Admin.Api.Tests;

/// <summary>
/// The upload allowlist is only meaningful if it checks something the uploader cannot choose. These
/// assert that the declared Content-Type is corroborated by the bytes, in both directions.
/// </summary>
public class FileSignatureTests
{
    private static MemoryStream Bytes(params byte[] head) => new(head);

    private static MemoryStream Png() =>
        Bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01, 0x02, 0x03);

    [Fact]
    public async Task Accepts_a_png_that_says_it_is_a_png()
        => Assert.Equal("image/png", await FileSignature.DetectAsync(Png(), "image/png"));

    [Fact]
    public async Task Rejects_a_png_that_claims_to_be_a_pdf()
        => Assert.Null(await FileSignature.DetectAsync(Png(), "application/pdf"));

    [Fact]
    public async Task Rejects_a_binary_masquerading_as_plain_text()
    {
        // A NUL byte is the cheap tell that "text/plain" is really a binary payload.
        var binary = Bytes(0x00, 0x01, 0x02, 0x03);
        Assert.Null(await FileSignature.DetectAsync(binary, "text/plain"));
    }

    [Fact]
    public async Task Accepts_real_text_as_text()
    {
        var csv = new MemoryStream("name,amount\nrent,1200\n"u8.ToArray());
        Assert.Equal("text/csv", await FileSignature.DetectAsync(csv, "text/csv"));
    }

    [Fact]
    public async Task Rejects_html_smuggled_in_as_an_image()
    {
        // The stored type is what a download serves back, so this is the stored-XSS shape.
        var html = new MemoryStream("<html><script>alert(1)</script></html>"u8.ToArray());
        Assert.Null(await FileSignature.DetectAsync(html, "image/png"));
    }

    [Fact]
    public async Task Rejects_an_unknown_binary_entirely()
        => Assert.Null(await FileSignature.DetectAsync(Bytes(0xDE, 0xAD, 0xBE, 0xEF), "application/pdf"));

    [Fact]
    public async Task Ooxml_may_pick_between_word_and_excel_but_not_beyond_the_family()
    {
        var zip = Bytes(0x50, 0x4B, 0x03, 0x04, 0x14, 0x00);
        Assert.Equal(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            await FileSignature.DetectAsync(zip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));

        zip.Position = 0;
        Assert.Null(await FileSignature.DetectAsync(zip, "image/png"));
    }

    [Fact]
    public async Task Rewinds_the_stream_so_the_caller_can_still_save_it()
    {
        var png = Png();
        await FileSignature.DetectAsync(png, "image/png");
        Assert.Equal(0, png.Position);
    }

    [Fact]
    public async Task Rejects_an_empty_upload()
        => Assert.Null(await FileSignature.DetectAsync(new MemoryStream(), "image/png"));
}
