
pipeline {
    agent any

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

try {
    # 1. Identify the exact Git commit checked out by Jenkins.
    $sha = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to identify the checked-out Git commit."
    }

    # 2. Collect commit parent information.
    $parentLine = (git rev-list --parents -n 1 HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to retrieve commit parent information."
    }

    $parentParts = @(
        $parentLine.Split(
            [char[]]@(' '),
            [System.StringSplitOptions]::RemoveEmptyEntries
        )
    )

    $numParents = [Math]::Max(0, $parentParts.Count - 1)
    $isMerge = if ($numParents -gt 1) { 1 } else { 0 }

    # 3. Count additions, deletions and changed files.
    $additions = 0
    $deletions = 0
    $filesModified = 0

    if ($numParents -gt 0) {
        $parentSha = $parentParts[1]
        $changeLines = @(
            git diff --numstat $parentSha $sha
        )

        if ($LASTEXITCODE -ne 0) {
            throw "Unable to calculate Git change statistics."
        }

        foreach ($line in $changeLines) {
            $parts = $line -split "`t"

            if ($parts.Count -ge 3) {
                $filesModified++

                # Binary files have '-' instead of numeric counts.
                if ($parts[0] -match '^\\d+$') {
                    $additions += [int]$parts[0]
                }

                if ($parts[1] -match '^\\d+$') {
                    $deletions += [int]$parts[1]
                }
            }
        }
    }
    else {
        Write-Warning "Root commit detected; change counts are zero."
    }

    # 4. Collect commit message information.
    $commitMessage = (git log -1 --format=%s).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read the commit message."
    }

    $msgLen = $commitMessage.Length

    # 5. Calculate time between the latest two commits.
    $commitTimes = @(git log -2 --format=%ct)
    $timeSinceLastCommit = 0

    if ($LASTEXITCODE -eq 0 -and $commitTimes.Count -ge 2) {
        $timeSinceLastCommit = [Math]::Max(
            0,
            [int]$commitTimes[0] - [int]$commitTimes[1]
        )
    }

    # 6. Identify the repository from the Git remote.
    $remoteUrl = (git remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to identify the Git origin remote."
    }

    $repo = $remoteUrl -replace '\\.git$', ''
    $repo = $repo -replace '^https?://github\\.com/', ''
    $repo = $repo -replace '^git@github\\.com:', ''

    # 7. Determine the event where Jenkins exposes it.
    $eventName = 'push'

    if ($env:CHANGE_ID) {
        $eventName = 'pull_request'
    }

    # 8. Build the request using real commit metadata.
    $payloadObject = @{
        additions = $additions
        deletions = $deletions
        total_churn = $additions + $deletions
        files_modified = $filesModified
        msg_len = $msgLen
        is_merge = $isMerge
        num_parents = $numParents
        time_since_last_commit = $timeSinceLastCommit
        repo = $repo
        event = $eventName
    }

    $payload = $payloadObject | ConvertTo-Json

    Write-Host "----------------------------------------"
    Write-Host "Automatic ML Failure Prediction"
    Write-Host "Commit: $sha"
    Write-Host "Repository: $repo"
    Write-Host "Files changed: $filesModified"
    Write-Host "Additions: $additions"
    Write-Host "Deletions: $deletions"
    Write-Host "Merge commit: $isMerge"
    Write-Host "Requesting prediction from Express API..."
    Write-Host "----------------------------------------"

    # 9. Call the existing Express endpoint.
    # Express forwards the request to FastAPI.
    $result = Invoke-RestMethod `
        -Uri 'http://127.0.0.1:5000/api/ml/predict' `
        -Method Post `
        -ContentType 'application/json' `
        -Body $payload `
        -TimeoutSec 15

    if (-not $result.prediction) {
        throw "The prediction API returned no prediction."
    }

    # 10. Save the prediction as a Jenkins workspace artifact.
    $outputObject = @{
        commit = $sha
        repository = $repo
        buildNumber = $env:BUILD_NUMBER
        metadata = $payloadObject
        prediction = $result.prediction
        generatedAt = (Get-Date).ToString('o')
    }

    $output = $outputObject | ConvertTo-Json -Depth 10

    Set-Content `
        -Path 'ml-prediction.json' `
        -Value $output `
        -Encoding UTF8

    Write-Host "ML prediction response:"
    Write-Host $output

    Write-Host "Prediction saved to ml-prediction.json"
}
catch {
    # Prediction is advisory. A prediction-service outage should
    # not prevent the normal build and SonarQube stages from running.
    Write-Warning "ML prediction unavailable: $($_.Exception.Message)"
}
'''
                    bat 'powershell -NoProfile -ExecutionPolicy Bypass -File predict-commit.ps1'
                }
            }
        }

        stage('Backend Dependencies') {
            steps {
                dir('backend') {
                    withEnv([
                        'PYTHON=C:\\Users\\MANISH RAGVENDRA C U\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
                    ]) {
                        bat '''
                            call "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat"
                            npm install --ignore-scripts
                            if errorlevel 1 exit /b 1

                            cd node_modules\\better-sqlite3
                            node "C:\\Users\\MANISH RAGVENDRA C U\\AppData\\Roaming\\npm\\node_modules\\node-gyp\\bin\\node-gyp.js" rebuild
                            if errorlevel 1 exit /b 1
                        '''
                    }
                }
            }
        }

        stage('Backend Tests') {
            steps {
                dir('backend') {
                    bat 'npm test --if-present'
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
                    withEnv([
                        'SONAR_HOST_URL=http://localhost:9000'
                    ]) {
                        bat '''
                            "C:\\sonar-scanner\\sonar-scanner-8.1.0.6389-windows-x64\\bin\\sonar-scanner.bat"
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'Environment checks, backend checks, and SonarQube analysis completed.'
        }

        failure {
            echo 'Pipeline failed. Review Console Output.'
        }

        always {
            archiveArtifacts(
                artifacts: 'ml-prediction.json',
                allowEmptyArchive: true
            )
        }
    }
}
