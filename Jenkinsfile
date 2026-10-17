
pipeline {
    agent any

    environment {
        SONAR_HOST_URL = 'http://localhost:9000'
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Source code is available locally.'
            }
        }

        stage('Verify Environment') {
            steps {
                bat 'node --version'
                bat 'npm --version'
                bat 'git --version'
            }
        }

        stage('Backend Checks') {
            steps {
                dir('backend') {
                    bat 'npm install'
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
                    bat '''
                    "C:\\sonar-scanner\\sonar-scanner-8.1.0.6389-windows-x64\\bin\\sonar-scanner.bat"
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'Build and SonarQube analysis completed.'
        }
        failure {
            echo 'Pipeline failed. Check the stage logs.'
        }
    }
}
