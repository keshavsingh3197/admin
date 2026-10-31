using System.Runtime.CompilerServices;
using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Auth.Dtos;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using Xunit;

namespace Admin.Api.Tests;

public class DisabledOtpChannelTests
{
    [Fact]
    public async Task Required_sender_rejects_instead_of_reporting_delivery()
    {
        await Assert.ThrowsAsync<AuthException>(() =>
            new DisabledWhatsAppSender().SendOtpAsync("+15551234567", "123456"));
    }

    [Fact]
    public void Legacy_settings_load_without_exposing_or_enabling_removed_fields()
    {
        var legacy = new BsonDocument
        {
            { "_id", AppSettings.SingletonId },
            { "WhatsAppTwoFactorEnabled", true },
            { "WhatsAppAlertsEnabled", true },
            { "WhatsAppAccessTokenEncrypted", "historical-test-value" },
            { "WhatsAppPhoneNumberId", "old-id" },
            { "WhatsAppAlertToNumber", "+15551234567" },
            { "SmsTwoFactorEnabled", true },
        };

        var settings = BsonSerializer.Deserialize<AppSettings>(legacy);
        Assert.True(settings.SmsTwoFactorEnabled);
        Assert.DoesNotContain(settings.ToBsonDocument().Names,
            name => name.Contains("WhatsApp", StringComparison.OrdinalIgnoreCase));

        // This setting is unconditional and requires neither Mongo nor initialization.
        var service = (IAuthSettings)RuntimeHelpers.GetUninitializedObject(typeof(SettingsService));
        Assert.False(service.WhatsAppTwoFactorEnabled);
        Assert.DoesNotContain(typeof(SettingsView).GetProperties(),
            property => property.Name.Contains("WhatsApp", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(typeof(UpdateSettingsRequest).GetProperties(),
            property => property.Name.Contains("WhatsApp", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Removed_send_and_verification_are_rejected_before_engine_execution(bool send)
    {
        object request = send
            ? new SendWhatsAppOtpRequest("pending-token")
            : new TwoFactorVerifyRequest("pending-token", "123456", (TwoFactorMethod)4);
        var context = CreateContext(request);

        new DisabledOtpChannelFilter().OnActionExecuting(context);

        var result = Assert.IsType<BadRequestObjectResult>(context.Result);
        Assert.Equal(StatusCodes.Status400BadRequest, result.StatusCode);
    }

    [Theory]
    [InlineData(TwoFactorMethod.Totp, 0)]
    [InlineData(TwoFactorMethod.Email, 1)]
    [InlineData(TwoFactorMethod.BackupCode, 2)]
    [InlineData(TwoFactorMethod.Sms, 3)]
    public void Other_methods_keep_numeric_values_and_pass_through(TwoFactorMethod method, int value)
    {
        Assert.Equal(value, (int)method);
        var context = CreateContext(new TwoFactorVerifyRequest("pending-token", "123456", method));

        new DisabledOtpChannelFilter().OnActionExecuting(context);

        Assert.Null(context.Result);
    }

    [Fact]
    public void Auth_audit_sink_has_no_notifier_dependency()
    {
        Assert.DoesNotContain(typeof(AdminAuthAuditSink).GetConstructors().Single().GetParameters(),
            parameter => parameter.ParameterType.Name.Contains("WhatsApp", StringComparison.OrdinalIgnoreCase));
    }

    private static ActionExecutingContext CreateContext(object request) => new(
        new ActionContext(new DefaultHttpContext(), new RouteData(), new ActionDescriptor()),
        new List<IFilterMetadata>(), new Dictionary<string, object?> { ["request"] = request }, new object());
}
