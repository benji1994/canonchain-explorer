const path = require('path');

function resolve(dir) {
    // console.log(path.join(__dirname, dir))
    return path.join(__dirname, dir);
}
module.exports = {
    lintOnSave: true,
    chainWebpack: (config) => {
        config.resolve.alias
            .set('@', resolve('src'))
            .set('@assets', resolve('src/assets'))
    },
    devServer: {
        proxy: {
            '/api': {
                target: 'http://localhost:50616',   //代理接口
                changeOrigin: true,
                pathRewrite: {
                    '^/api': '/api'    //代理的路径
                }
            }
        }
    }
};