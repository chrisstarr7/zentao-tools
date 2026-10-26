$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    $token = Get-MtrAccessToken
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject ([ordered]@{ token = $token }) -Compress))
    exit 0
}
catch {
    [Console]::Error.WriteLine('ZenTao token helper failed. Check local credentials, API V2 login availability, and network access; response details were suppressed.')
    exit 1
}
finally {
    $token = $null
}
