namespace Admin.Api.Dtos;

public sealed record DatabaseBackupView(string Id, string FileName, long SizeBytes, DateTime CreatedAt, string CreatedByUserId);
