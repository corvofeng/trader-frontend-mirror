/* groovylint-disable-next-line */
@Library('jenkins-pod') _

podTemplateLibrary {
    stage('Verify env') {
        echo "Building branch ${env.BRANCH_NAME}"
        echo "Building tag ${env.TAG_NAME}"
    }

    stage('Checkout') {
        checkout scm
        sh '''
            ls -alh
            git status
        '''
        if (env.TAG_NAME) {
        }
    }
}