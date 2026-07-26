exports.ERR_OBJECT_NOT_FOUND = 'ERR_OBJECT_NOT_FOUND'
exports.ERR_USER_NOT_FOUND = 'ERR_USER_NOT_FOUND'
exports.ERR_PASSWORD_ERROR = 'ERR_PASSWORD_ERROR'
exports.TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND'
exports.ERR_SERVER_ERROR = 'ERR_SERVER_ERROR'
exports.ERR_PERMISSION_DENY = 'ERR_PERMISSION_DENY'
exports.ERR_USER_DISABLED = 'ERR_USER_DISABLED'
exports.ERR_OBJECT_NAME_EXIST = 'ERR_OBJECT_NAME_EXIST'
exports.ERR_APPLICATION_ID_EXIST = 'ERR_APPLICATION_ID_EXIST'
exports.ERR_APPLICATION_NAME_EXIST = 'ERR_APPLICATION_NAME_EXIST'
exports.ERR_USERNAME_EXIST = 'ERR_USERNAME_EXIST'
exports.ERR_ROLE_ID_EXIST = 'ERR_ROLE_ID_EXIST'
exports.ERR_ROLE_NAME_EXIST = 'ERR_ROLE_NAME_EXIST'
exports.ERR_CATEGORY_NAME_EXIST = 'ERR_CATEGORY_NAME_EXIST'
exports.ERR_PERMISSION_ID_EXIST = 'ERR_PERMISSION_ID_EXIST'
exports.ERR_PERMISSION_NAME_EXIST = 'ERR_PERMISSION_NAME_EXIST',
exports.ERR_RESOURCE_EXIST = 'ERR_RESOURCE_EXIST'
exports.ERR_APPLICATION_ID_NOT_FOUND = 'ERR_APPLICATION_ID_NOT_FOUND'
exports.ERR_PERMISSION_ID_NOT_FOUND = 'ERR_PERMISSION_ID_NOT_FOUND'
exports.ERR_ROLE_ID_NOT_FOUND = 'ERR_ROLE_ID_NOT_FOUND'
exports.ERR_CATEGORY_ID_NOT_FOUND = 'ERR_CATEGORY_ID_NOT_FOUND'
exports.ERR_RESOURCE_ID_NOT_FOUND = 'ERR_RESOURCE_ID_NOT_FOUND'
exports.ERR_METHOD_INVALID = 'ERR_METHOD_INVALID'
exports.ERR_LDAP_CONFIG_NOT_FOUND = 'ERR_LDAP_CONFIG_NOT_FOUND'
exports.ERR_NOT_ALLOWED_RESET_PWD = 'ERR_NOT_ALLOWED_RESET_PWD'
exports.ERR_OLD_PASSWORD_INCORRECT = 'ERR_OLD_PASSWORD_INCORRECT'
exports.ERR_NEW_PASSWORD_TOO_WEAK = 'ERR_NEW_PASSWORD_TOO_WEAK'
exports.ERR_NEW_PASSWORD_SAME_AS_OLD = 'ERR_NEW_PASSWORD_SAME_AS_OLD'
exports.ERR_LOGIN_TEMPORARILY_LOCKED = 'ERR_LOGIN_TEMPORARILY_LOCKED'
exports.ERR_SORT_FIELD_INVALID = 'ERR_SORT_FIELD_INVALID'
exports.ERR_MESSAGE_TOO_LONG = 'ERR_MESSAGE_TOO_LONG'
exports.ERR_SESSION_BUSY = 'ERR_SESSION_BUSY'
exports.ERR_CAPTCHA_INVALID = 'ERR_CAPTCHA_INVALID'
exports.ERR_LOGIN_NEED_SUPER_OR_ADMIN = 'ERR_LOGIN_NEED_SUPER_OR_ADMIN'

const msgs = {
  ERR_OBJECT_NOT_FOUND: 'Object not found',
  ERR_USER_NOT_FOUND: 'User not found',
  ERR_PASSWORD_ERROR: 'Password error',
  TOKEN_NOT_FOUND: 'Token not found',
  ERR_SERVER_ERROR: 'Server Internal Error',
  ERR_PERMISSION_DENY: 'Permission Deny',
  ERR_USER_DISABLED: 'User is disabled',
  ERR_OBJECT_NAME_EXIST: 'Name already exists',
  ERR_APPLICATION_ID_EXIST: 'Application ID already exists',
  ERR_APPLICATION_NAME_EXIST: 'Application name already exists',
  ERR_USERNAME_EXIST: 'Username already exists',
  ERR_ROLE_ID_EXIST: 'Role ID already exists',
  ERR_ROLE_NAME_EXIST: 'Role name already exists',
  ERR_CATEGORY_NAME_EXIST: 'Category name already exists',
  ERR_PERMISSION_ID_EXIST: 'Permission ID already exists',
  ERR_PERMISSION_NAME_EXIST: 'Permission name already exists',
  ERR_RESOURCE_EXIST: 'Resource(appID+matchType+action+name) already exists',
  ERR_APPLICATION_ID_NOT_FOUND: 'Application ID not found',
  ERR_PERMISSION_ID_NOT_FOUND: 'Permission ID not found',
  ERR_ROLE_ID_NOT_FOUND: 'Role ID not found',
  ERR_CATEGORY_ID_NOT_FOUND: 'Category ID not found',
  ERR_RESOURCE_ID_NOT_FOUND: 'Resource ID not found',
  ERR_METHOD_INVALID: 'HTTP Request Method is Invalid',
  ERR_LDAP_CONFIG_NOT_FOUND: 'LDAP config not found',
  ERR_NOT_ALLOWED_RESET_PWD: 'Not allowed to reset password',
  ERR_OLD_PASSWORD_INCORRECT: 'The current password is incorrect',
  ERR_NEW_PASSWORD_TOO_WEAK: 'The new password is too weak',
  ERR_NEW_PASSWORD_SAME_AS_OLD: 'The new password must differ from the current one',
  ERR_LOGIN_TEMPORARILY_LOCKED: 'Too many failed login attempts, try again later',
  ERR_SORT_FIELD_INVALID: 'The sort field is not a valid column',
  ERR_MESSAGE_TOO_LONG: 'The message is too long',
  ERR_SESSION_BUSY: 'This session already has a request in progress',
  ERR_CAPTCHA_INVALID: 'Captcha is invalid',
  ERR_LOGIN_NEED_SUPER_OR_ADMIN: 'Need admin user to login wolf console',
}

function errmsg(reason) {
  return msgs[reason]
}

exports.errmsg = errmsg
