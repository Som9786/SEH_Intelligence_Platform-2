# Creates the PostgreSQL database pos_basket and loads data/pos_basket_august2.csv into it. The repository holds the CSV
# gzipped (data/pos_basket_august2.csv.gz, as GitHub refuses files over 100 MB); it's unzipped when there's no plain CSV.
# Drops and recreates the database, so it can be rerun. Needs $env:PGPASSWORD for the postgres user.
param(
    [string]$Csv = "$PSScriptRoot\..\..\data\pos_basket_august2.csv",
    [string]$Database = "pos_basket",
    [string]$PsqlBin = "$env:USERPROFILE\postgresql-18\pgsql\bin"
)
$ErrorActionPreference = "Stop"
$psql = Join-Path $PsqlBin "psql.exe"
$env:PGCLIENTENCODING = "UTF8"

# Unzip the CSV into the temp folder when only the .gz is there.
$unzipped = $null
if (-not (Test-Path $Csv) -and (Test-Path "$Csv.gz")) {
    $unzipped = Join-Path $env:TEMP "pos_basket_august2.csv"
    Write-Host "Unzipping $Csv.gz"
    $gz = New-Object IO.Compression.GZipStream ([IO.File]::OpenRead((Resolve-Path "$Csv.gz")), [IO.Compression.CompressionMode]::Decompress)
    try {
        $plain = [IO.File]::Create($unzipped)
        try { $gz.CopyTo($plain) } finally { $plain.Dispose() }
    } finally { $gz.Dispose() }
    $Csv = $unzipped
}

# The export ends partway through its last row (the corrupt basket 87F63136-..., which the table owner said can be
# deleted). COPY rejects a short row, so load a copy that stops at the last complete line.
$trimmed = Join-Path $env:TEMP "pos_basket_trimmed.csv"
$in = [IO.File]::OpenRead((Resolve-Path $Csv))
try {
    $length = $in.Length
    while ($length -gt 0) {
        $in.Seek($length - 1, [IO.SeekOrigin]::Begin) | Out-Null
        if ($in.ReadByte() -eq 10) { break }
        $length--
    }
    $in.Seek(0, [IO.SeekOrigin]::Begin) | Out-Null
    $out = [IO.File]::Create($trimmed)
    try {
        $buffer = New-Object byte[] (4MB)
        $remaining = $length
        while ($remaining -gt 0) {
            $read = $in.Read($buffer, 0, [Math]::Min($buffer.Length, $remaining))
            $out.Write($buffer, 0, $read)
            $remaining -= $read
        }
    } finally { $out.Dispose() }
    Write-Host "Dropped $($in.Length - $length) bytes of incomplete last row"
} finally { $in.Dispose() }

try {
    & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $Database WITH (FORCE);" -c "CREATE DATABASE $Database ENCODING 'UTF8' TEMPLATE template0;"
    if ($LASTEXITCODE -ne 0) { throw "Creating $Database failed" }
    # Forward slashes: with backslashes psql quotes the path as E'...', which \copy doesn't accept.
    & $psql -h localhost -U postgres -d $Database -v ON_ERROR_STOP=1 -v "csv=$($trimmed -replace '\\', '/')" -1 -f "$PSScriptRoot\01-load.sql"
    if ($LASTEXITCODE -ne 0) { throw "Loading $Database failed" }
} finally {
    Remove-Item $trimmed -ErrorAction SilentlyContinue
    if ($unzipped) { Remove-Item $unzipped -ErrorAction SilentlyContinue }
}
