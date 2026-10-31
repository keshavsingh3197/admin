using KeshavSingh.Auth.Dtos;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Admin.Api.Services;

/// <summary>Rejects the removed channel on the still-mounted shared auth API before engine execution.</summary>
public sealed class DisabledOtpChannelFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (context.ActionArguments.Values.Any(value =>
            value is SendWhatsAppOtpRequest ||
            value is TwoFactorVerifyRequest { Method: TwoFactorMethod.WhatsApp }))
        {
            context.Result = new BadRequestObjectResult(new { error = "WhatsApp authentication is not supported." });
        }
    }

    public void OnActionExecuted(ActionExecutedContext context) { }
}
