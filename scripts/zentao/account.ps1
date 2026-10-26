$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    $credential = Get-MtrStoredCredential
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject ([ordered]@{ account = [string]$credential.account }) -Compress))
    exit 0
}
catch {
    [Console]::Error.WriteLine('ZenTao account metadata is unavailable. Run setup again.')
    exit 1
}
