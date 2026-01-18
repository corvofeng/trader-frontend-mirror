# 使用官方的 Node.js 镜像作为基础镜像
FROM node:22-alpine AS client-build

# 设置工作目录
WORKDIR /app/

# 复制 package.json 和 package-lock.json 到工作目录
COPY ./package.json ./*.lock ./

# ## BOF CLEAN
# # 国内用户可能设置 regietry
# ARG registry=https://registry.npmmirror.com/
# ARG disturl=https://npmmirror.com/dist
# RUN yarn config set disturl $disturl
# RUN yarn config set registry $registry
# ## EOF CLEAN

# 安装项目依赖
RUN yarn --only=prod

# 复制项目文件到工作目录
COPY ./ .
# RUN echo "VITE_ENV=production" > .env

# 构建项目
RUN npm run build


RUN ls -alh