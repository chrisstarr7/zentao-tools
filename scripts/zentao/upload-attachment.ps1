[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][int]$TaskID
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'upload-validation.ps1')

function Get-MtrTaskFiles([int]$Id, [string]$Token, [System.Net.Http.HttpClient]$Client) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$(Get-MtrApiBaseUri)/tasks/$Id")
    $request.Headers.Add('token', $Token)
    $response = $null
    try {
        $response = $Client.SendAsync($request).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) { return $null }
        $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return $json | ConvertFrom-Json
    }
    catch { return $null }
    finally {
        if ($response) { $response.Dispose() }
        $request.Dispose()
    }
}

try {
    $file = Get-MtrValidatedAttachment $FilePath $TaskID
    $token = Get-MtrAccessToken
    Add-Type -AssemblyName System.Net.Http
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    $multipart = [System.Net.Http.MultipartFormDataContent]::new()
    $multipart.Add([System.Net.Http.StringContent]::new('task'), 'objectType')
    $multipart.Add([System.Net.Http.StringContent]::new([string]$TaskID), 'objectID')
    $stream = [IO.File]::OpenRead($file.FullName)
    $fileContent = [System.Net.Http.StreamContent]::new($stream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
    $multipart.Add($fileContent, 'file', $file.Name)
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$(Get-MtrApiBaseUri)/files")
    $request.Headers.Add('token', $token)
    $request.Content = $multipart

    $response = $null
    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
    }
    catch {
        $task = Get-MtrTaskFiles $TaskID $token $client
        $verified = Test-MtrAttachmentInTask $task $file.Name $file.Length
        $result = [ordered]@{ status = if ($verified) { 'success' } else { 'unknown' }; verified = $verified; retrySafe = $false; fileName = $file.Name; taskID = $TaskID; recoveredAfterTimeout = $verified }
        [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
        exit 0
    }

    if ($response.StatusCode.value__ -ge 300 -and $response.StatusCode.value__ -lt 400) { throw 'ZenTao upload redirected the credentialed request; upload was stopped.' }
    if (-not $response.IsSuccessStatusCode) {
        if ($response.StatusCode.value__ -ge 500) {
            $task = Get-MtrTaskFiles $TaskID $token $client
            $verified = Test-MtrAttachmentInTask $task $file.Name $file.Length
            $result = [ordered]@{ status = if ($verified) { 'success' } else { 'unknown' }; verified = $verified; retrySafe = $false; fileName = $file.Name; taskID = $TaskID }
            [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
            exit 0
        }
        throw "ZenTao rejected the attachment upload (HTTP $([int]$response.StatusCode))."
    }

    $responseJson = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $uploadResult = $responseJson | ConvertFrom-Json
    if ($uploadResult.status -ne 'success' -or [int]$uploadResult.id -le 0) { throw 'ZenTao did not confirm attachment upload.' }
    $task = Get-MtrTaskFiles $TaskID $token $client
    $verified = Test-MtrAttachmentInTask $task $file.Name $file.Length
    $result = [ordered]@{ status = 'success'; verified = $verified; fileID = [int]$uploadResult.id; fileName = $file.Name; taskID = $TaskID }
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
    exit 0
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
finally {
    $token = $null
    if ($response) { $response.Dispose() }
    if ($request) { $request.Dispose() }
    if ($fileContent) { $fileContent.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($multipart) { $multipart.Dispose() }
    if ($client) { $client.Dispose() }
    if ($handler) { $handler.Dispose() }
}
