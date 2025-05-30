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
        git remote add mirror git@github.com:corvofeng/trader-frontend-mirror.git
        git push -u mirror main
        '''
        if (env.TAG_NAME) {
        }
    }
}
