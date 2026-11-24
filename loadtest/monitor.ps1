# Polls /health once a second and logs status + live version, to measure
# downtime during a deploy or rollback.
#   powershell -File loadtest\monitor.ps1 -Url https://<app-url> -Minutes 20
param(
  [Parameter(Mandatory)] [string] $Url,
  [int] $Minutes = 20,
  [string] $Out = "results\monitor.csv"
)
New-Item -ItemType Directory -Path (Split-Path $Out) -Force | Out-Null
"time,status,version,ms" | Out-File $Out -Encoding ascii
$end = (Get-Date).AddMinutes($Minutes)
$last = ''
while ((Get-Date) -lt $end) {
  $t = Get-Date
  $o = curl.exe -s --max-time 5 -o NUL -D - -w "CODE:%{http_code} MS:%{time_total}" "$($Url.TrimEnd('/'))/health" 2>$null | Out-String
  $code = [regex]::Match($o, 'CODE:(\d+)').Groups[1].Value
  $ms = [math]::Round([double]([regex]::Match($o, 'MS:([\d.]+)').Groups[1].Value) * 1000)
  $ver = [regex]::Match($o, '(?im)^x-app-version:\s*(\S+)').Groups[1].Value
  if (-not $ver) { $ver = 'v1(no-header)' }
  if (-not $code -or $code -eq '000') { $code = 'down' }
  "{0},{1},{2},{3}" -f $t.ToString('HH:mm:ss'), $code, $ver, $ms | Out-File $Out -Append -Encoding ascii
  $state = "$code $ver"
  if ($state -ne $last) { Write-Output ("{0}  status={1} version={2}" -f $t.ToString('HH:mm:ss'), $code, $ver); $last = $state }
  $wait = 1000 - ((Get-Date) - $t).TotalMilliseconds
  if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
}
Write-Output "MONITOR_DONE"
