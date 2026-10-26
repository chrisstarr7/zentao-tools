function Get-MtrValidatedAttachment([string]$FilePath, [int]$TaskID) {
    if ($TaskID -le 0) { throw 'Task ID must be a positive integer.' }
    if ([string]::IsNullOrWhiteSpace($FilePath)) { throw 'A document path is required.' }
    $file = Get-Item -LiteralPath $FilePath -ErrorAction Stop
    if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Attachment path must be a regular file.' }
    $allowedExtensions = @('.doc', '.docx', '.md', '.odt', '.pdf', '.rtf', '.txt', '.xls', '.xlsx', '.ppt', '.pptx')
    if ($file.Extension.ToLowerInvariant() -notin $allowedExtensions) { throw 'Unsupported requirement document type.' }
    if ($file.Length -le 0) { throw 'Attachment file is empty.' }
    if ($file.Length -gt 50MB) { throw 'Attachment exceeds the 50 MiB local safety limit.' }
    return $file
}

function Test-MtrAttachmentInTask([object]$Task, [string]$FileName, [long]$FileSize) {
    $files = $Task.files
    if (-not $files -and $Task.task) { $files = $Task.task.files }
    if (-not $files -and $Task.data) { $files = $Task.data.files }
    foreach ($file in @($files)) {
        $name = if ($file.title) { [string]$file.title } elseif ($file.name) { [string]$file.name } elseif ($file.fileName) { [string]$file.fileName } else { [string]$file.filename }
        $size = if ($file.size -ne $null) { [long]$file.size } elseif ($file.filesize -ne $null) { [long]$file.filesize } else { -1 }
        if ($name -eq $FileName -and $size -eq $FileSize) { return $true }
    }
    return $false
}
