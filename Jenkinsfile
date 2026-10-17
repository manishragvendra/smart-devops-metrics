
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

       
stage('Backend Dependencies') {
    steps {
        dir('backend') {
            withEnv([
                'PYTHON=C:\\Users\\MANISH RAGVENDRA C U\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
                'GYP_MSVS_VERSION=2026'
            ]) {
                bat '''
                    call "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat"
                    npm install
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
                withCredentials([string(
                    credentialsId: 'sonarqube-token',
                    variable: 'SONAR_TOKEN'
                )]) {
                    withEnv(['SONAR_HOST_URL=http://localhost:9000']) {
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
            echo 'GitHub checkout, backend checks, and SonarQube analysis completed.'
        }
        failure {
            echo 'Pipeline failed. Review Console Output.'
        }
    }
}
