<#
.SYNOPSIS
  Stops the SEH Intelligence Platform: whatever is listening on the services' and the UI's ports.

.EXAMPLE
  .\stop-all.ps1
#>

$ports = @{ 5000 = 'Gateway'; 5100 = 'Analytics'; 5200 = 'AI Hub'; 5300 = 'DB Catalog'; 5174 = 'UI' }

foreach ($port in $ports.Keys | Sort-Object) {
    $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -eq 0) {
        Write-Host "  $($ports[$port]) wasn't running" -ForegroundColor DarkGray
        continue
    }
    foreach ($id in $owners) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Stopped $($ports[$port]) (port $port)" -ForegroundColor Cyan
}
