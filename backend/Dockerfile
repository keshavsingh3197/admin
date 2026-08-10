# syntax=docker/dockerfile:1.7
# Build context is the repo's backend/ directory (Render "Root Directory" = backend).
# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first (layer-cached) using just the project file + NuGet source config.
# The private KeshavSingh.* packages need PACKAGES_READ_TOKEN. On Render, add it as a
# Secret File named PACKAGES_READ_TOKEN (build secrets can't come from env vars); the
# mount below reads it without baking it into the image.
COPY nuget.config ./
COPY Admin.Api.csproj ./
RUN --mount=type=secret,id=PACKAGES_READ_TOKEN,required=false \
    if [ -f /run/secrets/PACKAGES_READ_TOKEN ]; then \
        export PACKAGES_READ_TOKEN="$(cat /run/secrets/PACKAGES_READ_TOKEN)"; \
    elif [ -z "${PACKAGES_READ_TOKEN:-}" ]; then \
        echo "PACKAGES_READ_TOKEN is required to restore private GitHub Packages." >&2; \
        exit 1; \
    fi \
    && dotnet restore Admin.Api.csproj --configfile /src/nuget.config

# Then copy the rest and publish (no second restore).
COPY . .
RUN dotnet publish Admin.Api.csproj -c Release -o /app/publish /p:UseAppHost=false --no-restore

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080

ENTRYPOINT ["dotnet", "Admin.Api.dll"]
