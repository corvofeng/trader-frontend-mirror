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
        '''

        sh '''
        [ -d ~/.ssh ] || mkdir ~/.ssh && chmod 0700 ~/.ssh
        ssh-keyscan -t rsa,ed25519 github.com >> ~/.ssh/known_hosts
        '''

        sshagent(credentials: ['id_ed25519_ansible']) {
            sh '''
                git checkout main
                git push -u mirror main
            '''
        }

        if (env.TAG_NAME) {
        }
    }
}
