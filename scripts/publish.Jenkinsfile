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

        if (env.TAG_NAME) {
            sshagent(credentials: ['id_ed25519_ansible']) {
                sh """
                git checkout -b main
                git push -u mirror main
                git push -u mirror ${env.TAG_NAME}
                """
            }
        }
    }
    stage('Build and publish') {
        sh '''
        docker build . -f scripts/Dockerfile -t trader-frontend:latest
        '''
        if (env.TAG_NAME) {
            sshagent(credentials: ['id_ed25519_ansible']) {
                sh '''
                set -e
                cid=$(docker create trader-frontend:latest)
                rm -rf dist-publish
                mkdir -p dist-publish
                docker cp "$cid":/app/dist/. dist-publish/
                docker rm "$cid"

                git fetch mirror
                git checkout -B dist
                rm -rf *
                cp -r dist-publish/* .
                rm -rf dist-publish

                git config user.name "jenkins"
                git config user.email "jenkins@example.com"
                git add .
                git commit -m "chore: publish dist for ${TAG_NAME:-$BRANCH_NAME} $(date +%Y%m%d%H%M%S)" || echo "No changes to commit"
                git push -u mirror dist
                '''
            }
        }
    }
}
