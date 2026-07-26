const config = require('../../conf/config')
const UserModel = require('../model/user')
const util = require('./util')

/* istanbul ignore next */
async function createUser(username, nickname, manager) {
  const user = await UserModel.findOne({where: {username}})
  if (user) {
    console.log('user [%s] is exist!', username);
    return;
  }
  // 只有随机生成的口令才需要打印——它没有别的传达渠道。
  // 来自配置/环境变量的口令部署方已经知道，打印到日志只会多一个泄露点。
  const configuredPassword = config.rootUserInitialPassword
  const password = configuredPassword || util.randomString(12)
  const values = {username, nickname, manager}
  values.password = util.encodePassword(password);
  values.status = 0;
  values.lastLogin = 0;
  // 初始口令一律标记为必须修改，登录后由 Console 强制走改密流程。
  values.profile = {mustChangePassword: true};
  values.createTime = util.unixtime();
  values.updateTime = util.unixtime();
  await UserModel.create(values);
  if (configuredPassword) {
    console.log('system user [%s] created with the configured initial password, ' +
      'it must be changed on first login.', username)
  } else {
    console.log('system user [%s] created, the generated password is %s. ' +
      'It must be changed on first login.', username, password)
  }
}

async function addRootUser() {
  await createUser('root', 'root(super man)', 'super')
  await createUser('admin', 'administrator', 'admin')
}

// 增加重试逻辑，确保数据库完全就绪后再创建用户
async function addRootUserWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await addRootUser();
      console.log('root user initialization completed successfully');
      return;
    } catch (err) {
      console.log('create root user failed (attempt %d/%d): %s', i + 1, maxRetries, err.message);
      if (i < maxRetries - 1) {
        console.log('waiting %d seconds before retry...', delayMs / 1000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.log('create root user failed after %d attempts! err: %s', maxRetries, err);
      }
    }
  }
}

// 初始延迟5秒，然后开始重试（最多10次，每次间隔3秒）
/* istanbul ignore next */
setTimeout(() => {
  addRootUserWithRetry(10, 3000);
}, 5000);

module.exports = { addRootUser, addRootUserWithRetry, createUser }
