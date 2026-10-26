$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("zentao-tools-test-" + [guid]::NewGuid().ToString('N'))
$originalEnvironment = @{
    USERPROFILE = $env:USERPROFILE
    LOCALAPPDATA = $env:LOCALAPPDATA
    HOME = $env:HOME
}
$null = New-Item -ItemType Directory -Path $tempRoot
$global:testKeychain = @{}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Test-NativeMacOSKeychain {
    param([string]$TemporaryRoot)

    $security = '/usr/bin/security'
    $keychainPath = Join-Path $TemporaryRoot 'native-smoke.keychain-db'
    $service = 'mcp-token-renewal.smoke'
    $account = [guid]::NewGuid().ToString('N')

    & $security create-keychain -p 'test-only-keychain-password' $keychainPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated macOS Keychain.' }
    try {
        & $security unlock-keychain -p 'test-only-keychain-password' $keychainPath | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not unlock the isolated macOS Keychain.' }

        & $security add-generic-password -U -s $service -a $account -w 'test-only-password' $keychainPath | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not save a dummy credential to the isolated macOS Keychain.' }

        $storedPassword = [string](& $security find-generic-password -s $service -a $account -w $keychainPath 2>$null)
        if ($LASTEXITCODE -ne 0 -or $storedPassword -ne 'test-only-password') {
            throw 'Could not read the dummy credential from the isolated macOS Keychain.'
        }

        & $security delete-generic-password -s $service -a $account $keychainPath 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not delete the dummy credential from the isolated macOS Keychain.' }
    }
    finally {
        & $security delete-keychain $keychainPath 2>$null | Out-Null
    }
}

try {
    $env:USERPROFILE = $tempRoot
    $env:HOME = $tempRoot
    $env:LOCALAPPDATA = Join-Path $tempRoot 'LocalAppData'
    . (Join-Path $repoRoot 'scripts/zentao/upload-validation.ps1')
    $attachmentPath = Join-Path $tempRoot 'requirement.docx'
    [IO.File]::WriteAllText($attachmentPath, 'test requirement')
    $validatedAttachment = Get-MtrValidatedAttachment $attachmentPath 123
    Assert-True ($validatedAttachment.Name -eq 'requirement.docx') 'Attachment validation changed the source file name.'
    $invalidAttachment = Join-Path $tempRoot 'unrelated.exe'
    [IO.File]::WriteAllText($invalidAttachment, 'not a document')
    $unsupportedAttachmentRejected = $false
    try { Get-MtrValidatedAttachment $invalidAttachment 123 | Out-Null } catch { $unsupportedAttachmentRejected = $true }
    Assert-True $unsupportedAttachmentRejected 'Attachment validation accepted an unsupported file type.'
    $emptyAttachment = Join-Path $tempRoot 'empty.pdf'
    [IO.File]::WriteAllBytes($emptyAttachment, [byte[]]@())
    $emptyAttachmentRejected = $false
    try { Get-MtrValidatedAttachment $emptyAttachment 123 | Out-Null } catch { $emptyAttachmentRejected = $true }
    Assert-True $emptyAttachmentRejected 'Attachment validation accepted an empty file.'
    $oversizedAttachment = Join-Path $tempRoot 'large.pdf'
    $largeStream = [IO.File]::Open($oversizedAttachment, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $largeStream.SetLength(50MB + 1) } finally { $largeStream.Dispose() }
    $oversizedAttachmentRejected = $false
    try { Get-MtrValidatedAttachment $oversizedAttachment 123 | Out-Null } catch { $oversizedAttachmentRejected = $true }
    Assert-True $oversizedAttachmentRejected 'Attachment validation accepted a file over the local safety cap.'
    $invalidTaskRejected = $false
    try { Get-MtrValidatedAttachment $attachmentPath 0 | Out-Null } catch { $invalidTaskRejected = $true }
    Assert-True $invalidTaskRejected 'Attachment validation accepted an invalid task ID.'

    $null = New-Item -ItemType Directory -Path (Join-Path $tempRoot '.codex')
    . (Join-Path $repoRoot 'scripts/zentao/configure.ps1')

    $codexPath = Get-MtrConfigPath 'Codex'
    $codexFixture = @'
[mcp_servers.zentao]
url = 'https://pms.daoyoudao.com/zentao/mcp' # keep comment
http_headers = { token = "old" }

[mcp_servers.zentao.tools.get_projects]
approval_mode = "read-only"

[mcp_servers.zentao.tools.get_executions]
approval_mode = "read-only"
'@
    [IO.File]::WriteAllText($codexPath, $codexFixture)
    $codexUpdate = Get-CodexMcpConfigUpdate
    Assert-True ([regex]::Matches($codexUpdate.Content, '(?m)^\s*url\s*=').Count -eq 1) 'Codex update duplicated its URL.'
    Assert-True ($codexUpdate.Content.Contains('[mcp_servers.zentao.tools.get_projects]')) 'Codex update dropped the projects approval table.'
    Assert-True ($codexUpdate.Content.Contains('[mcp_servers.zentao.tools.get_executions]')) 'Codex update dropped the executions approval table.'
    Assert-True ($codexUpdate.Content.Contains('approval_mode = "read-only"')) 'Codex update changed tool approval rules.'

    [IO.File]::WriteAllText($codexPath, "[mcp_servers.zentao]`nurl = `"https://other.example/mcp`"`n")
    $rejectedUrl = $false
    try { Get-CodexMcpConfigUpdate | Out-Null } catch { $rejectedUrl = $true }
    Assert-True $rejectedUrl 'Codex update accepted a different server URL.'

    $claudePath = Get-MtrConfigPath 'Claude'
    [IO.File]::WriteAllText($claudePath, '{"mcpServers":{"other":{"type":"http","url":"https://example.com/mcp"}}}')
    $claudeUpdate = Get-ClaudeMcpConfigUpdate
    $claudeConfig = $claudeUpdate.Content | ConvertFrom-Json
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$claudeConfig.mcpServers.zentao.headersHelper)) 'Claude config did not receive its helper command.'
    Assert-True ($claudeConfig.mcpServers.other.url -eq 'https://example.com/mcp') 'Claude update changed an unrelated server.'

    $platform = Get-MtrPlatform
    Assert-True ((Get-MtrLoginUri) -eq 'https://pms.daoyoudao.com/api.php/v2/users/login') 'ZenTao API V2 login URI is incorrect.'
    Import-MtrSecurityModule
    if ($platform -eq 'Windows') {
        Assert-True ([bool](Get-Command ConvertTo-SecureString -ErrorAction SilentlyContinue)) 'Windows Security module did not expose ConvertTo-SecureString.'
        Assert-True ($codexUpdate.Content.Contains('powershell.exe')) 'Windows helper command does not use Windows PowerShell.'
        Assert-True ((Get-MtrCredentialPath).StartsWith($env:LOCALAPPDATA, [StringComparison]::OrdinalIgnoreCase)) 'Windows credentials are outside LocalAppData.'
    }
    else {
        Assert-True ($codexUpdate.Content.Contains('pwsh')) 'macOS helper command does not use PowerShell 7.'
        Assert-True ((Get-MtrCredentialPath).Contains('Library/Application Support')) 'macOS credential metadata path is incorrect.'
        Assert-True ((Get-MtrSecurityCommand) -eq '/usr/bin/security') 'macOS Keychain command path is incorrect.'
        $expectedShellArgument = "'" + '/tmp/a' + "'" + '"' + "'" + '"' + "'" + 'b c' + "'"
        Assert-True ((ConvertTo-MtrShellArgument "/tmp/a'b c") -ceq $expectedShellArgument) 'macOS shell argument quoting failed.'
        Test-NativeMacOSKeychain $tempRoot

        function Get-MtrSecurityCommand { return 'Invoke-TestSecurity' }
        function Invoke-TestSecurity {
            param(
                [string]$Operation,
                [switch]$U,
                [string]$s,
                [string]$a,
                [switch]$w
            )
            if ($Operation -eq 'add-generic-password') {
                Assert-True $w 'Production passed the Keychain password in its argument list.'
                $global:testKeychain[$a] = 'test-only-password'
            }
            elseif ($Operation -eq 'find-generic-password') {
                if (-not $global:testKeychain.ContainsKey($a)) { $global:LASTEXITCODE = 1; return }
                Write-Output $global:testKeychain[$a]
            }
            elseif ($Operation -eq 'delete-generic-password') {
                $null = $global:testKeychain.Remove($a)
            }
            $global:LASTEXITCODE = 0
        }
    }

    function global:Read-Host {
        param([string]$Prompt, [switch]$AsSecureString)
        if ($AsSecureString) { return ConvertTo-SecureString 'test-only-password' -AsPlainText -Force }
        return 'test-account'
    }

    & (Join-Path $repoRoot 'scripts/zentao/save-credentials.ps1')
    $credentialPath = Get-MtrCredentialPath
    $savedCredential = Get-Content -LiteralPath $credentialPath -Raw | ConvertFrom-Json
    Assert-True ($savedCredential.account -eq 'test-account') 'Credential account was not saved.'
    if ($platform -eq 'Windows') {
        Assert-True (-not $savedCredential.password_protected.Contains('test-only-password')) 'Windows credential file contains the plaintext password.'
        $testSecurePassword = ConvertTo-SecureString ([string]$savedCredential.password_protected)
        $testPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($testSecurePassword)
        try {
            $roundTripPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($testPasswordPointer)
            Assert-True ($roundTripPassword -eq 'test-only-password') 'Windows DPAPI credential could not be decrypted for the current user.'
        }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($testPasswordPointer) }
    }
    else {
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$savedCredential.credential_id)) 'macOS Keychain identifier was not saved.'
        Assert-True (-not $savedCredential.PSObject.Properties['password_protected']) 'macOS credential file contains a password field.'
        $roundTripPassword = [string](Invoke-TestSecurity find-generic-password -s (Get-MtrCredentialService) -a ([string]$savedCredential.credential_id) -w)
        Assert-True ($roundTripPassword -eq 'test-only-password') 'macOS Keychain credential could not be read back.'
    }

    & (Join-Path $repoRoot 'scripts/zentao/remove-credentials.ps1')
    Assert-True (-not (Test-Path -LiteralPath $credentialPath)) 'Credential cleanup did not remove credential metadata.'
    if ($platform -eq 'macOS') {
        $null = Invoke-TestSecurity find-generic-password -s (Get-MtrCredentialService) -a ([string]$savedCredential.credential_id) -w 2>$null
        Assert-True (-not $global:testKeychain.ContainsKey([string]$savedCredential.credential_id)) 'Credential cleanup left the password in the test Keychain store.'
    }

    $global:LASTEXITCODE = 0
    'ZenTao configuration and credential smoke checks passed on ' + $platform + '.'
}
finally {
    foreach ($name in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
    }
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
