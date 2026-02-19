import { ref } from 'vue'

import { defineStore } from 'pinia'

export const defaultServerPassword = '<服务器密码>'

/** 服务器信息储存 */
export const useSrcdsStore = defineStore(
  'srcds',
  () => {
    const password = ref(defaultServerPassword)
    const passwordTV = ref(defaultServerPassword)

    /** 重置 */
    function reset() {
      password.value = defaultServerPassword
      passwordTV.value = defaultServerPassword
    }

    return {
      password,
      passwordTV,
      reset,
    }
  },
  { persist: true },
)
