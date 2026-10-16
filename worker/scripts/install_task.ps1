<#
Daftarkan daemon scheduler worker ke Windows Task Scheduler supaya otomatis jalan
saat login (laptop dev lokal). Daemon menjalankan catch-up saat start, jadi job
yang terlewat ketika laptop mati tetap dikerjakan.

    powershell -ExecutionPolicy Bypass -File worker\scripts\install_task.ps1
    powershell -ExecutionPolicy Bypass -File worker\scripts\install_task.ps1 -Remove
#>
param([switch]$Remove)

$TaskName = "IRIS-Worker-Scheduler"
$WorkerDir = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $WorkerDir ".venv\Scripts\python.exe"
$LogDir = Join-Path $WorkerDir "logs"

if ($Remove) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Task $TaskName dihapus."
    return
}

if (-not (Test-Path $Python)) {
    Write-Error "venv belum ada: jalankan 'python -m venv .venv' dan 'pip install -r requirements.txt' di folder worker."
    return
}
New-Item -ItemType Directory -Force $LogDir | Out-Null

$cmd = "/c cd /d `"$WorkerDir`" && `"$Python`" -m iris_worker.scheduler >> `"$LogDir\scheduler.log`" 2>&1"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory $WorkerDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "IRIS Terminal: refresh data harian + klasifikasi BTC mingguan + whale ingest" -Force | Out-Null
Write-Host "Task $TaskName terdaftar (jalan saat login). Log: $LogDir\scheduler.log"
Write-Host "Mulai sekarang tanpa logout: Start-ScheduledTask -TaskName $TaskName"
