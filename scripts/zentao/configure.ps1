$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$serverName = 'zentao'
$serverUrl = 'https://pms.daoyoudao.com/zentao/mcp'
$helperPath = Join-Path $PSScriptRoot 'get-headers.ps1'

function Backup-ConfigFile([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $backupPath = "$Path.bak-$stamp"
        Copy-Item -LiteralPath $Path -Destination $backupPath
        Write-Host "Backed up existing config to $backupPath"
    }
}

function Write-ConfigFile([string]$Path, [string]$Content) {
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        $null = New-Item -ItemType Directory -Force -Path $directory
    }
    $temporaryPath = "$Path.tmp-$PID"
    [IO.File]::WriteAllText($temporaryPath, $Content, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

function Get-CodexMcpConfigUpdate {
    $configPath = Get-MtrConfigPath 'Codex'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $content = [IO.File]::ReadAllText($configPath)
    }
    else {
        $content = ''
    }

    $sectionRegex = '(?ms)^\[mcp_servers\.zentao\][ \t]*(?:\r?\n|$).*?(?=^\[|\z)'
    $sectionMatches = [regex]::Matches($content, $sectionRegex)
    if ($sectionMatches.Count -gt 1) {
        throw 'Codex config has duplicate [mcp_servers.zentao] sections; resolve them manually before setup.'
    }
    if ([regex]::IsMatch($content, '(?m)^[ \t]*\[\[mcp_servers\.zentao\]\][ \t]*(?:#.*)?$')) {
        throw 'Codex ZenTao config uses an array table that this setup script cannot safely update; resolve it manually before setup.'
    }
    if ([regex]::IsMatch($content, '(?m)^[ \t]*\[mcp_servers\.zentao\.(?:http_headers|env_http_headers|oauth|bearer_token)\][ \t]*(?:#.*)?$')) {
        throw 'Codex ZenTao config uses a nested authentication table that this setup script cannot safely update; resolve it manually before setup.'
    }

    $helper = Get-MtrHelperCommand $helperPath
    if ($sectionMatches.Count -eq 1) {
        $section = $sectionMatches[0].Value
        $urlMatches = [regex]::Matches($section, '(?m)^\s*url\s*=\s*["'']([^"'']*)["'']\s*(?:#.*)?$')
        $urlKeyLines = [regex]::Matches($section, '(?m)^\s*url\s*=')
        if ($urlMatches.Count -ne $urlKeyLines.Count) {
            throw 'Codex ZenTao url uses a format this setup script cannot safely update; resolve it manually before setup.'
        }
        if ($urlMatches.Count -gt 1) {
            throw 'Codex ZenTao entry has duplicate url keys; resolve them manually before setup.'
        }
        if ($urlMatches.Count -eq 1 -and $urlMatches[0].Groups[1].Value -ne $serverUrl) {
            throw "Existing Codex server '$serverName' uses a different URL; no config was changed."
        }
        if ($urlMatches.Count -eq 0) {
            $section = $section.TrimEnd("`r", "`n") + "`r`nurl = `"$serverUrl`"`r`n"
        }

        $section = [regex]::Replace($section, '(?m)^[ \t]*(?:env_http_headers|http_headers|bearer_token_env_var|bearer_token|oauth|http_headers_helper)[ \t]*=.*(?:\r?\n|$)', '')
        $helperLine = "http_headers_helper = $(ConvertTo-Json -InputObject $helper -Compress)"
        $section = $section.TrimEnd("`r", "`n") + "`r`n$helperLine`r`n"
        $content = $content.Substring(0, $sectionMatches[0].Index) + $section + $content.Substring($sectionMatches[0].Index + $sectionMatches[0].Length)
    }
    else {
        if (-not [string]::IsNullOrWhiteSpace($content) -and -not $content.EndsWith("`n")) { $content += "`r`n" }
        $content += "`r`n[mcp_servers.zentao]`r`nurl = `"$serverUrl`"`r`nhttp_headers_helper = $(ConvertTo-Json -InputObject $helper -Compress)`r`n"
    }

    return [pscustomobject]@{ Path = $configPath; Content = $content }
}

function Get-ClaudeMcpConfigUpdate {
    $configPath = Get-MtrConfigPath 'Claude'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        try { $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json }
        catch { throw "Claude config is not valid JSON; no config was changed: $configPath" }
    }
    else {
        $config = [pscustomobject]@{}
    }

    if (-not $config.PSObject.Properties['mcpServers']) {
        $config | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([pscustomobject]@{})
    }
    if ($null -eq $config.mcpServers) { $config.mcpServers = [pscustomobject]@{} }
    $existing = $config.mcpServers.PSObject.Properties[$serverName]
    if ($existing -and $existing.Value.url -and $existing.Value.url -ne $serverUrl) {
        throw "Existing Claude server '$serverName' uses a different URL; no config was changed."
    }

    if ($existing) {
        $entry = $existing.Value
        foreach ($authProperty in @('headers', 'headersHelper', 'oauth')) {
            if ($entry.PSObject.Properties[$authProperty]) { $entry.PSObject.Properties.Remove($authProperty) }
        }
        if (-not $entry.PSObject.Properties['type']) { $entry | Add-Member -MemberType NoteProperty -Name type -Value 'http' }
        if (-not $entry.PSObject.Properties['url']) { $entry | Add-Member -MemberType NoteProperty -Name url -Value $serverUrl }
        $entry.type = 'http'
        $entry.url = $serverUrl
        $entry | Add-Member -MemberType NoteProperty -Name headersHelper -Value (Get-MtrHelperCommand $helperPath) -Force
    }
    else {
        $entry = [pscustomobject][ordered]@{
            type = 'http'
            url = $serverUrl
            headersHelper = Get-MtrHelperCommand $helperPath
        }
        $config.mcpServers | Add-Member -MemberType NoteProperty -Name $serverName -Value $entry
    }

    $json = ConvertTo-Json -InputObject $config -Depth 100
    return [pscustomobject]@{ Path = $configPath; Content = ($json + "`r`n") }
}

function Restore-FileState([string]$Path, [bool]$Existed, [string]$Content) {
    if ($Existed) { Write-ConfigFile $Path $Content }
    elseif (Test-Path -LiteralPath $Path -PathType Leaf) { Remove-Item -LiteralPath $Path -Force }
}

if ($MyInvocation.InvocationName -ne '.') {
    $platform = Get-MtrPlatform

    Write-Host 'Select the client(s) to configure:'
    Write-Host '  1. Codex'
    Write-Host '  2. Claude'
    Write-Host '  3. Both'
    $choice = Read-Host 'Choice (1-3)'
    if ($choice -notin @('1', '2', '3')) { throw 'Select 1, 2, or 3.' }

    # Validate and prepare every selected client before asking for or storing credentials.
    $updates = @()
    if ($choice -in @('1', '3')) { $updates += Get-CodexMcpConfigUpdate }
    if ($choice -in @('2', '3')) { $updates += Get-ClaudeMcpConfigUpdate }

    $originals = @{}
    foreach ($update in $updates) {
        $originals[$update.Path] = [pscustomobject]@{
            Existed = (Test-Path -LiteralPath $update.Path -PathType Leaf)
            Content = if (Test-Path -LiteralPath $update.Path -PathType Leaf) { [IO.File]::ReadAllText($update.Path) } else { $null }
        }
    }

    try {
        foreach ($update in $updates) {
            Backup-ConfigFile $update.Path
            Write-ConfigFile $update.Path $update.Content
            Write-Host "Configured ZenTao MCP in $($update.Path)"
        }

        & (Join-Path $PSScriptRoot 'save-credentials.ps1')
        if (-not $?) { throw 'Credential setup failed.' }
    }
    catch {
        $failure = $_
        foreach ($update in $updates) {
            $original = $originals[$update.Path]
            try { Restore-FileState $update.Path $original.Existed $original.Content }
            catch { Write-Warning "Could not restore config $($update.Path): $($_.Exception.Message)" }
        }
        throw $failure
    }

    Write-Host 'Setup complete. Restart the selected MCP client to reload its ZenTao server configuration.'
}
