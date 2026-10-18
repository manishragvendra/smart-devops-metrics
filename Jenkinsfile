
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
    }

    stages {
        stage('Verify Environment') {
            steps {
                bat 'node --version'
                bat 'npm --version'
                bat 'git --version'
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
if (-not $repo) {
    $repo = 'manishragvendra/smart-devops-metrics'
}

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

# Include the first parent when calculating changes for ordinary commits.
# For merge commits, this still gives a consistent first-parent comparison.
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
Write-Host 'Requesting prediction from Express API...'

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

$result = Invoke-RestMethod `
    -Uri $env:ML_API_URL `
    -Method Post `
    -ContentType 'application/json' `
    -Body $payload `
    -TimeoutSec 15

if (-not $result.prediction) {
    throw 'The prediction API returned no prediction.'
}

$predictionDocument = @{
    commit = $commit
    repository = $repo
    generatedAt = (Get-Date).ToString('o')
    metadata = @{
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
    }
    prediction = $result.prediction
    buildNumber = $buildNumber
}

$predictionDocument |
    ConvertTo-Json -Depth 10 |
    Set-Content -Path 'ml-prediction.json' -Encoding UTF8

Write-Host '----------------------------------------'
Write-Host 'ML prediction response:'
Get-Content 'ml-prediction.json'
Write-Host 'Prediction saved to ml-prediction.json'
'''

                    bat 'powershell -NoProfile -ExecutionPolicy Bypass -File predict-commit.ps1'
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



        stage('SonarQube Analysis') {
            steps {
                withCredentials([
                    string(
                        credentialsId: 'sonarqube-token',
                        variable: 'SONAR_TOKEN'
                    )
                ]) {
                    withEnv(["SONAR_HOST_URL=${SONAR_HOST_URL}"]) {
                        bat '''
"C:\\sonar-scanner\\sonar-scanner-8.1.0.6389-windows-x64\\bin\\sonar-scanner.bat" ^
  -Dsonar.projectKey=%SONAR_PROJECT_KEY% ^
  -Dsonar.host.url=%SONAR_HOST_URL% ^
  -Dsonar.token=%SONAR_TOKEN%
'''
                    }
                }
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
            echo 'Pipeline completed successfully.'
        }

        failure {
            echo 'Pipeline failed. Review Console Output.'
        }
    }
}
