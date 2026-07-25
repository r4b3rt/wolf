<script setup lang="ts">
import { ref, reactive } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import { message } from "@/utils/message";
import { changePwd } from "@/api/user";

/**
 * 首次登录强制改密。
 *
 * root / admin 在初始化时使用部署方配置的初始口令，服务端会给账号打上
 * mustChangePassword 标记；登录接口把该标记回传，Console 在进入后台前
 * 必须先让用户把口令改掉。对话框不可关闭，只能改密或退出登录。
 */

const MIN_PASSWORD_LENGTH = 8;

const visible = defineModel<boolean>({ required: true });

const emit = defineEmits<{
  (e: "changed"): void;
  (e: "cancel"): void;
}>();

const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: ""
});

const rules: FormRules = {
  oldPassword: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    {
      min: MIN_PASSWORD_LENGTH,
      message: `新密码不能少于 ${MIN_PASSWORD_LENGTH} 位`,
      trigger: "blur"
    },
    {
      validator: (_rule, value: string, callback) => {
        if (value && value === form.oldPassword) {
          callback(new Error("新密码不能与当前密码相同"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  confirmPassword: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== form.newPassword) {
          callback(new Error("两次输入的密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ]
};

function reset() {
  form.oldPassword = "";
  form.newPassword = "";
  form.confirmPassword = "";
  formRef.value?.clearValidate();
}

async function onSubmit() {
  const formEl = formRef.value;
  if (!formEl) return;
  const valid = await formEl.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    const res = await changePwd(form.oldPassword, form.newPassword);
    if (res?.ok) {
      message("密码修改成功", { type: "success" });
      reset();
      visible.value = false;
      emit("changed");
    } else {
      message(res?.errmsg || res?.reason || "密码修改失败", { type: "error" });
    }
  } catch (e) {
    message("密码修改失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function onCancel() {
  reset();
  visible.value = false;
  emit("cancel");
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="请先修改初始密码"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    append-to-body
  >
    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="当前账号仍在使用部署时的初始密码"
      description="为避免账号被他人直接登录，请先设置一个新密码。"
      class="mb-4"
    />
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="90px"
      @submit.prevent="onSubmit"
    >
      <el-form-item label="当前密码" prop="oldPassword">
        <el-input
          v-model="form.oldPassword"
          type="password"
          show-password
          autocomplete="current-password"
          placeholder="请输入当前密码"
        />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input
          v-model="form.newPassword"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="至少 8 位"
        />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="请再次输入新密码"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="loading" @click="onCancel">退出登录</el-button>
      <el-button type="primary" :loading="loading" @click="onSubmit">
        修改并继续
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mb-4 {
  margin-bottom: 16px;
}
</style>
