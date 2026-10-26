function Get-MtrPlatform {
    if ($IsWindows -or [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { return 'Windows' }
    if ($IsMacOS) { return 'macOS' }
    throw 'ZenTao setup supports Windows and macOS only.'
}

function Get-MtrHomeDirectory {
    $homePath = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
    if ([string]::IsNullOrWhiteSpace($homePath)) { throw 'Could not determine the current user home directory.' }
    return $homePath
}

function Get-MtrConfigPath([ValidateSet('Codex', 'Claude')][string]$Client) {
    $homePath = Get-MtrHomeDirectory
    if ($Client -eq 'Codex') { return Join-Path (Join-Path $homePath '.codex') 'config.toml' }
    return Join-Path $homePath '.claude.json'
}

function Get-MtrCredentialDirectory {
    $homePath = Get-MtrHomeDirectory
    if ((Get-MtrPlatform) -eq 'Windows') {
        $basePath = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $homePath 'AppData/Local' }
        return Join-Path $basePath 'McpTokenRenewal/zentao'
    }
    return Join-Path $homePath 'Library/Application Support/McpTokenRenewal/zentao'
}

function Get-MtrCredentialPath {
    return Join-Path (Get-MtrCredentialDirectory) 'credentials.json'
}

function ConvertTo-MtrShellArgument([string]$Value) {
    $quote = "'"
    $escaped = $Value.Replace($quote, ($quote + '"' + $quote + '"' + $quote))
    return $quote + $escaped + $quote
}

function Get-MtrHelperCommand([string]$HelperPath) {
    $platform = Get-MtrPlatform
    if ($platform -eq 'Windows') {
        $powershell = Get-Command powershell.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
        $powershellPath = if ($powershell.Source) { $powershell.Source } else { $powershell.Path }
        if ([string]::IsNullOrWhiteSpace($powershellPath)) { throw 'Windows PowerShell is required.' }
        $quotedPwsh = '"' + $powershellPath.Replace('"', '\"') + '"'
        $quotedHelper = '"' + $HelperPath.Replace('"', '\"') + '"'
        return "$quotedPwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $quotedHelper"
    }

    $pwsh = Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $pwshPath = if ($pwsh.Source) { $pwsh.Source } else { $pwsh.Path }
    if ([string]::IsNullOrWhiteSpace($pwshPath)) { throw 'PowerShell 7 (pwsh) is required on macOS.' }
    return "$(ConvertTo-MtrShellArgument $pwshPath) -NoProfile -NonInteractive -File $(ConvertTo-MtrShellArgument $HelperPath)"
}

function Get-MtrSecurityCommand {
    if ((Get-MtrPlatform) -ne 'macOS') { throw 'macOS Keychain is available only on macOS.' }
    return '/usr/bin/security'
}

function Get-MtrCredentialService {
    return 'mcp-token-renewal.zentao'
}

function Get-MtrLoginUri {
    return 'https://pms.daoyoudao.com/api.php/v2/users/login'
}

function Get-MtrApiBaseUri {
    return 'https://pms.daoyoudao.com/api.php/v2'
}

function Import-MtrSecurityModule {
    if ((Get-MtrPlatform) -eq 'Windows' -and -not (Get-Command ConvertTo-SecureString -ErrorAction SilentlyContinue)) {
        $manifest = Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'
        Import-Module -Name $manifest -ErrorAction Stop
    }
}

function Get-MtrStoredCredential {
    $credentialPath = Get-MtrCredentialPath
    if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) { throw 'ZenTao credential metadata is unavailable.' }
    try { $credential = Get-Content -LiteralPath $credentialPath -Raw | ConvertFrom-Json }
    catch { throw 'ZenTao credential metadata is invalid.' }
    if ([string]::IsNullOrWhiteSpace([string]$credential.account)) { throw 'ZenTao credential metadata is incomplete.' }
    if ((Get-MtrPlatform) -eq 'Windows' -and [string]::IsNullOrWhiteSpace([string]$credential.password_protected)) {
        throw 'ZenTao credential metadata is incomplete.'
    }
    if ((Get-MtrPlatform) -eq 'macOS' -and [string]::IsNullOrWhiteSpace([string]$credential.credential_id)) {
        throw 'ZenTao credential metadata is incomplete.'
    }
    return $credential
}

function Get-MtrStoredPassword([psobject]$Credential) {
    $platform = Get-MtrPlatform
    Import-MtrSecurityModule
    if ($platform -eq 'Windows') {
        $securePassword = ConvertTo-SecureString ([string]$Credential.password_protected)
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    }
    $security = Get-MtrSecurityCommand
    $password = [string](& $security find-generic-password -s (Get-MtrCredentialService) -a ([string]$Credential.credential_id) -w 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($password)) { throw 'macOS Keychain credential unavailable.' }
    return $password
}

function Get-MtrAccessToken {
    $credential = Get-MtrStoredCredential
    $password = Get-MtrStoredPassword $credential
    $client = $null
    $handler = $null
    $content = $null
    $httpResponse = $null
    $body = $null
    $responseJson = $null
    try {
        Add-Type -AssemblyName System.Net.Http
        $handler = [System.Net.Http.HttpClientHandler]::new()
        $handler.AllowAutoRedirect = $false
        $client = [System.Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(7)
        $body = @{ account = [string]$credential.account; password = $password } | ConvertTo-Json -Compress
        $content = [System.Net.Http.StringContent]::new($body, [Text.Encoding]::UTF8, 'application/json')
        $httpResponse = $client.PostAsync((Get-MtrLoginUri), $content).GetAwaiter().GetResult()
        if (-not $httpResponse.IsSuccessStatusCode) { throw 'login request rejected' }
        $responseJson = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $response = $responseJson | ConvertFrom-Json
        if ($response.status -ne 'success' -or [string]::IsNullOrWhiteSpace([string]$response.token)) { throw 'login rejected' }
        return [string]$response.token
    }
    finally {
        $password = $null
        $body = $null
        $responseJson = $null
        $credential = $null
        if ($content) { $content.Dispose() }
        if ($httpResponse) { $httpResponse.Dispose() }
        if ($client) { $client.Dispose() }
        if ($handler) { $handler.Dispose() }
    }
}
