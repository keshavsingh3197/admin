using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;
namespace Admin.Api.Services;
public sealed class PermissionMasterService
{
    private readonly IMongoCollection<PermissionDefinition> _items;
    public PermissionMasterService(MongoDbService db) => _items = db.GetCollection<PermissionDefinition>("permission_definitions");
    public Task EnsureIndexesAsync(CancellationToken ct=default) => _items.Indexes.CreateOneAsync(new CreateIndexModel<PermissionDefinition>(Builders<PermissionDefinition>.IndexKeys.Ascending(x=>x.Key),new CreateIndexOptions{Unique=true}),cancellationToken:ct);
    public async Task SeedAsync(CancellationToken ct=default) { foreach(var x in PermissionCatalog.AdminPermissions.Concat(PermissionCatalog.SiteActions)) { var scope=x.Key.StartsWith("site.")?"site":"admin"; await _items.UpdateOneAsync(p=>p.Key==x.Key,Builders<PermissionDefinition>.Update.SetOnInsert(p=>p.Key,x.Key).SetOnInsert(p=>p.Scope,scope).SetOnInsert(p=>p.Category,x.Category).SetOnInsert(p=>p.Label,x.Label).SetOnInsert(p=>p.Description,x.Description).SetOnInsert(p=>p.IsSystem,true).Set(p=>p.UpdatedAt,DateTime.UtcNow),new UpdateOptions{IsUpsert=true},ct); } }
    public async Task<PermissionCatalogResponse> CatalogAsync(IReadOnlyList<WebsiteAccessOptionDto> websites,CancellationToken ct=default) { var list=await _items.Find(x=>x.IsActive).SortBy(x=>x.Category).ThenBy(x=>x.Label).ToListAsync(ct); return new(list.Where(x=>x.Scope=="admin").Select(Map).ToList(),list.Where(x=>x.Scope=="site").Select(Map).ToList(),websites); }
    public async Task<bool> IsValidAsync(string site,string key,CancellationToken ct=default) => await _items.Find(x=>x.Key==key&&x.IsActive&&(site==PermissionCatalog.AdminWebsiteKey?x.Scope=="admin":x.Scope=="site")).AnyAsync(ct);
    public async Task<IReadOnlyList<string>> KeysAsync(string scope,CancellationToken ct=default) => await _items.Find(x=>x.Scope==scope&&x.IsActive).Project(x=>x.Key).ToListAsync(ct);
    private static PermissionCatalogItemDto Map(PermissionDefinition x)=>new(x.Key,x.Category,x.Label,x.Description);
}
