pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        ML_API_URL = 'http://127.0.0.1:5000/api/ml/predict'
        SONAR_HOST_URL = 'http://localhost:9000'
        SONAR_PROJECT_KEY = 'Smart-DevOps-Metrics'
        GITHUB_REPOSITORY = 'manishragvendra/smart-devops-metrics'

        DORA_API = 'http://127.0.0.1:5000'
        DORA_PROJECT_ID = '2'
        LOCAL_APP_URL = 'http://127.0.0.1:4173'
    }

    stages {
        stage('Verify Environment') {
            steps {
                bat 'node --version'
                bat 'npm --version'
                bat 'git --version'
            }
        }

        stage('Capture Commit Metadata') {
            steps {
                script {
                    env.COMMIT_SHA = bat(
                        returnStdout: true,
                        script: '@git rev-parse HEAD'
                    ).trim()

                    // Double %% because this command runs through Windows bat.
                    env.COMMIT_AT = bat(
                        returnStdout: true,
                        script: '@git log -1 --format=%%cI HEAD'
                    ).trim()

                    echo "Commit: ${env.COMMIT_SHA}"
                    echo "Commit timestamp: ${env.COMMIT_AT}"
                }
            }
        }

        stage('Predict CI/CD Failure from Git Commit') {
            steps {
                script {
                    writeFile file: 'predict-commit.ps1', text: '''
$ErrorActionPreference = 'Stop'

$commit = (git rev-parse HEAD).Trim()
$parents = (git rev-list --parents -n 1 HEAD).Trim().Split(' ')
$numParents = [Math]::Max(0, $parents.Length - 1)
$isMerge = if ($numParents -gt 1) { 1 } else { 0 }

$message = (git log -1 --pretty=%s).Trim()
$msgLen = $message.Length

$repo = $env:GITHUB_REPOSITORY
$event = 'push'

$diff = @(git diff-tree --no-commit-id --numstat -r HEAD)
$additions = 0
$deletions = 0
$filesModified = 0

foreach ($line in $diff) {
    $parts = $line -split "`t"

    if ($parts.Length -ge 3) {
        $filesModified++
        $a = 0
        $d = 0

        if ([int]::TryParse($parts[0], [ref]$a)) {
            $additions += $a
        }

        if ([int]::TryParse($parts[1], [ref]$d)) {
            $deletions += $d
        }
    }
}

# Fallback for commits where diff-tree returned no file changes.
if ($filesModified -eq 0) {
    $diff = @(git diff --numstat HEAD^ HEAD 2>$null)

    foreach ($line in $diff) {
        $parts = $line -split "`t"

        if ($parts.Length -ge 3) {
            $filesModified++
            $a = 0
            $d = 0

            if ([int]::TryParse($parts[0], [ref]$a)) {
                $additions += $a
            }

            if ([int]::TryParse($parts[1], [ref]$d)) {
                $deletions += $d
            }
        }
    }
}

$totalChurn = $additions + $deletions
$commitTime = [long](git show -s --format=%ct HEAD)
$previousTimeText = git show -s --format=%ct HEAD^ 2>$null
$previousTime = 0

if ([long]::TryParse(($previousTimeText | Select-Object -First 1), [ref]$previousTime)) {
    $timeSinceLastCommit = [Math]::Max(0, $commitTime - $previousTime)
} else {
    $timeSinceLastCommit = 0
}

$buildNumber = $env:BUILD_NUMBER
if (-not $buildNumber) {
    $buildNumber = 'unknown'
}

Write-Host '----------------------------------------'
Write-Host 'Automatic ML Failure Prediction'
Write-Host "Commit: $commit"
Write-Host "Repository: $repo"
Write-Host "Build number: $buildNumber"
Write-Host "Files changed: $filesModified"
Write-Host "Additions: $additions"
Write-Host "Deletions: $deletions"
Write-Host "Merge commit: $isMerge"

$payloadObject = @{
    additions = $additions
    deletions = $deletions
    total_churn = $totalChurn
    files_modified = $filesModified
    msg_len = $msgLen
    is_merge = $isMerge
    num_parents = $numParents
    time_since_last_commit = $timeSinceLastCommit
    repo = $repo
    event = $event
    commit = $commit
    repository = $repo
    buildNumber = $buildNumber
}

$payload = $payloadObject | ConvertTo-Json -Depth 5

Write-Host 'Requesting prediction from Express API...'

$result = Invoke-RestMethod `
    -Uri $env:ML_API_URL `
    -Method Post `
    -ContentType 'application/json' `
    -Body $payload `
    -TimeoutSec 15

if ($null -eq $result.prediction) {
    throw 'The prediction API returned no prediction.'
}

$predictionDocument = @{
    commit = $commit
    repository = $repo
    generatedAt = (Get-Date).ToString('o')
    metadata = $payloadObject
    prediction = $result.prediction
    buildNumber = $buildNumber
}

$predictionDocument |
    ConvertTo-Json -Depth 10 |
    Set-Content -Path 'ml-prediction.json' -Encoding UTF8

Write-Host 'ML prediction response:'
Get-Content 'ml-prediction.json'
Write-Host 'Prediction saved to ml-prediction.json'
'''

                    bat 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File predict-commit.ps1'
                }
            }
        }

        stage('Backend Dependencies') {
            steps {
                dir('backend') {
                    bat 'npm install'
                }
            }
        }

        stage('Backend Tests') {
            steps {
                dir('backend') {
                    bat 'npm test'
                }
            }
            post {
                always {
                    junit testResults: 'backend/test-results/junit.xml',
                          allowEmptyResults: false
                }
            }
        }

        stage('Source Code Coverage') {
            steps {
                dir('source-code') {
    bat 'npm install'
}
dir('backend') {
    bat 'npx jest --config .\\jest.source-coverage.config.cjs --runInBand --no-cache --forceExit'
}

                powershell '''
                    $report = "coverage-source/lcov.info"

                    if (-not (Test-Path $report)) {
                        throw "Coverage report not found: $report"
                    }

                    (Get-Content $report) -replace '^SF:.*example\\.js$', 'SF:source-code/example.js' |
                        Set-Content -Encoding ascii $report

                    Write-Host "Coverage source paths:"
                    Select-String '^SF:' $report
                '''
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withCredentials([
                    string(
                        credentialsId: 'sonarqube-token',
                        variable: 'SONAR_TOKEN'
                    )
                ]) {
                    bat '''
"C:\\sonar-scanner\\sonar-scanner-8.1.0.6389-windows-x64\\bin\\sonar-scanner.bat" ^
 -Dsonar.projectKey=%SONAR_PROJECT_KEY% ^
 -Dsonar.host.url=%SONAR_HOST_URL% ^
 -Dsonar.token=%SONAR_TOKEN%
'''
                }
            }
        }

        stage('Frontend Dependencies and Build') {
            steps {
                dir('frontend') {
                    bat 'npm ci'
                    bat 'npm run build'
                }
            }
        }

        stage('Deploy Frontend Locally') {
            steps {
                writeFile file: 'deploy-local.ps1', text: '''
$ErrorActionPreference = 'Stop'

$port = 4173
$frontendPath = Join-Path $env:WORKSPACE 'frontend'
$logOut = Join-Path $env:WORKSPACE 'frontend-preview.log'
$logErr = Join-Path $env:WORKSPACE 'frontend-preview-error.log'

if (-not (Test-Path (Join-Path $frontendPath 'dist\\index.html'))) {
    throw 'Frontend build output is missing.'
}

$listener = Get-NetTCPConnection `
    -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($listener) {
    $existingProcess = Get-CimInstance Win32_Process `
        -Filter "ProcessId = $($listener.OwningProcess)"

    if (-not $existingProcess -or
        $existingProcess.CommandLine -notmatch 'vite.*preview|vite\\.js.*preview') {
        throw "Port $port is occupied by another process. No process was stopped."
    }

    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 2
}

$process = Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList @('/c', 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort') `
    -WorkingDirectory $frontendPath `
    -RedirectStandardOutput $logOut `
    -RedirectStandardError $logErr `
    -WindowStyle Hidden `
    -PassThru

$healthy = $false

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2

    try {
        $response = Invoke-WebRequest `
            -Uri $env:LOCAL_APP_URL `
            -UseBasicParsing -TimeoutSec 3

        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        # Continue while Vite starts.
    }

    if ($process.HasExited) {
        break
    }
}

if (-not $healthy) {
    if (Test-Path $logOut) { Get-Content $logOut }
    if (Test-Path $logErr) { Get-Content $logErr }
    throw 'Local frontend deployment failed its health check.'
}

Write-Host "Local deployment verified at $env:LOCAL_APP_URL"
'''

                bat 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy-local.ps1'
            }
        }

        stage('Record DORA Deployment') {
            steps {
                writeFile file: 'record-dora.ps1', text: '''
$ErrorActionPreference = 'Stop'

$payload = @{
    projectId = [int]$env:DORA_PROJECT_ID
    commitSha = $env:COMMIT_SHA
    commitAt = $env:COMMIT_AT
    environment = 'local'
    deployedAt = [DateTime]::UtcNow.ToString('o')
    status = 'SUCCESS'
    causedFailure = $false
    source = 'jenkins'
}

$json = $payload | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod `
    -Uri "$($env:DORA_API)/api/dora/deployments" `
    -Method Post `
    -ContentType 'application/json' `
    -Body $json `
    -TimeoutSec 10

Write-Host 'DORA deployment event recorded.'
Write-Host "Deployment ID: $($result.deploymentId)"
'''

                bat 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File record-dora.ps1'
            }
        }
    }

    post {
        always {
            archiveArtifacts(
                artifacts: 'ml-prediction.json',
                allowEmptyArchive: true
            )
        }

        success {
            echo 'Pipeline completed successfully, including local deployment and DORA recording.'
        }

        failure {
            echo 'Pipeline failed. Review Console Output for the failing stage.'
        }
    }
}