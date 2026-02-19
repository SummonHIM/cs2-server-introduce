<template>
  <div class="min-h-screen w-full flex flex-col items-center justify-center">
    <div class="flex-1 flex flex-col items-center justify-center">
      <Image :src="FavIcon" alt="FavIcon" width="256" height="256" />

      <h3>由 {{ srcdsEnv.provider }} 提供的</h3>
      <h1 class="text-4xl">{{ srcdsEnv.name }} 服务器</h1>

      <div class="mt-6">
        <Button
          :as="buttonConfig.href ? 'a' : undefined"
          :href="buttonConfig.href"
          :label="buttonConfig.label"
          :icon="buttonConfig.icon"
          :severity="buttonConfig.severity"
          size="large"
          raised
          @click="buttonConfig.click"
        />
      </div>

      <div class="font-thin text-xs">
        <router-link class="underline" to="/manual">手动连接</router-link>

        <!-- <a>&nbsp;|&nbsp;</a>
        <a class="underline cursor-pointer" @click="launchSteamConnectTVLink">CSTV</a> -->

        <template v-if="protocol === 'http:' || protocol === 'https:'">
          <a>&nbsp;|&nbsp;</a>
          <a class="underline" :href="appDownUrl" target="_blank">下载客户端</a>
        </template>

        <a>&nbsp;|&nbsp;</a>
        <a class="underline cursor-pointer" @click="srcdsStoreOpenDialog">设置服务器密码</a>
      </div>
    </div>

    <Dialog v-model:visible="steamConnectDialog" modal header="正在连接到服务器…">
      <p>如果没有任何反应，请确认已安装并登录 Steam 客户端。</p>
    </Dialog>

    <Dialog
      class="w-md"
      v-model:visible="srcdsSetDialog"
      modal
      header="设置服务器密码"
      @keydown.enter="srcdsSaveStore"
    >
      <FloatLabel class="mt-2" variant="on">
        <Password
          id="set_srcds_password"
          v-model="srcdsSetForms.password"
          :feedback="false"
          fluid
          toggleMask
        />
        <label for="set_srcds_password">服务器密码</label>
      </FloatLabel>
      <p class="mt-1 font-thin text-xs">密码会长期保存在当前浏览器中。</p>

      <FloatLabel class="mt-2" variant="on">
        <Password
          id="set_srcds_password_tv"
          v-model="srcdsSetForms.passwordTV"
          :feedback="false"
          fluid
          toggleMask
        />
        <label for="set_srcds_password_tv">CSTV 密码</label>
      </FloatLabel>
      <p class="mt-1 font-thin text-xs">密码会长期保存在当前浏览器中。</p>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <!-- 左侧 -->
          <Button
            label="关闭"
            severity="secondary"
            variant="text"
            @click="srcdsSetDialog = false"
          />

          <!-- 右侧 -->
          <div class="flex gap-2">
            <Button label="重置" severity="secondary" @click="srcdsResetStore" />
            <Button label="保存" @click="srcdsSaveStore" autofocus />
          </div>
        </div>
      </template>
    </Dialog>

    <footer>
      <GlobalFooter />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { type ComputedRef, type Ref, computed, onMounted, ref } from 'vue'

import { AxiosError } from 'axios'
import { useToast } from 'primevue'

import FavIcon from '@/assets/logo/favicon.png'
import { DNSError, getDNSStatusMessage } from '@/dns'
import { generateSteamBrowserProtocol, srcdsEnv } from '@/srcds'
import { defaultServerPassword, useSrcdsStore } from '@/stores/srcds'

enum BtnConnectStatus {
  ERROR = 1,
  RESOLVING = 2,
  RESOLVERROR = 3,
  NETERROR = 4,
  NEEDPASSWD = 5,
}

interface ButtonConfig {
  href?: string
  label: string
  icon: string
  severity: string
  click?: () => void
}

defineOptions({
  name: 'HomePage',
})

const toast = useToast()
const protocol = window.location.protocol

// 服务器配置存储
const srcdsStore = useSrcdsStore()

// APP 下载链接
const appDownUrl = `https://github.com/${srcdsEnv.provider ?? 'GitHub'}/cs2-server-introduce/releases/latest`

// 服务器连接渐进式链接
const steamConnectLink: Ref<BtnConnectStatus | string> = ref(BtnConnectStatus.RESOLVING)
const steamConnectDialog = ref(false)

// 服务器连接按钮样式
const buttonConfig: ComputedRef<ButtonConfig> = computed(() => {
  if (typeof steamConnectLink.value === 'string') {
    return {
      label: '开始游戏',
      icon: 'pi pi-play-circle',
      severity: 'success',
      click: launchSteamConnectLink,
    }
  }

  switch (steamConnectLink.value) {
    case BtnConnectStatus.RESOLVING:
      return {
        label: '正在查询',
        icon: 'pi pi-spin pi-spinner',
        severity: 'secondary',
      }

    case BtnConnectStatus.RESOLVERROR:
      return {
        label: '查询错误',
        icon: 'pi pi-exclamation-triangle',
        severity: 'danger',
        click: refreshSteamConnectLink,
      }

    case BtnConnectStatus.NETERROR:
      return {
        label: '网络错误',
        icon: 'pi pi-exclamation-triangle',
        severity: 'danger',
        click: refreshSteamConnectLink,
      }

    case BtnConnectStatus.NEEDPASSWD:
      return {
        label: '设置密码',
        icon: 'pi pi-pencil',
        severity: 'warn',
        click: srcdsStoreOpenDialog,
      }

    default:
    case BtnConnectStatus.ERROR:
      return {
        label: '未知错误',
        icon: 'pi pi-exclamation-triangle',
        severity: 'danger',
        click: refreshSteamConnectLink,
      }
  }
})

// 服务器配置对话框和表单
const srcdsSetDialog = ref(false)
const srcdsSetForms = ref({
  password: '',
  passwordTV: '',
})

/**
 * 刷新渐进式链接
 */
async function refreshSteamConnectLink() {
  try {
    steamConnectLink.value = BtnConnectStatus.RESOLVING
    const password = srcdsStore.password !== defaultServerPassword ? srcdsStore.password : undefined
    steamConnectLink.value = await generateSteamBrowserProtocol(
      srcdsEnv.addr,
      srcdsEnv.port,
      password,
    )
  } catch (error) {
    switch (true) {
      case error instanceof DNSError:
        console.error(error)
        steamConnectLink.value = BtnConnectStatus.RESOLVERROR
        toast.add({
          severity: 'error',
          summary: '查询IP地址时发生错误',
          detail: `查询IP地址失败。DNS服务器响应：${getDNSStatusMessage(error.status)}。`,
          life: 5000,
        })
        break

      case error instanceof AxiosError:
        console.error(error)
        steamConnectLink.value = BtnConnectStatus.NETERROR
        toast.add({
          severity: 'error',
          summary: '查询IP地址时发生错误',
          detail: `网络错误。请检查网络连接。(${error.message})`,
          life: 5000,
        })
        break

      default:
      case error instanceof Error:
        console.error(error)
        steamConnectLink.value = BtnConnectStatus.ERROR
        toast.add({
          severity: 'error',
          summary: '查询IP地址时发生错误',
          detail: '发生未知错误！请查看控制台并将错误信息发送给站点管理员。',
          life: 5000,
        })
        break
    }
  }
}

/**
 * 跳转到服务器连接渐进式链接
 */
function launchSteamConnectLink() {
  if (typeof steamConnectLink.value !== 'string') return

  steamConnectDialog.value = true

  setTimeout(() => {
    if (typeof steamConnectLink.value !== 'string') return
    window.location.href = steamConnectLink.value
  }, 500)
}

/** 打开服务器配置编辑对话框 */
function srcdsStoreOpenDialog() {
  srcdsSetForms.value.password =
    srcdsStore.password !== defaultServerPassword ? srcdsStore.password : ''
  srcdsSetForms.value.passwordTV =
    srcdsStore.passwordTV !== defaultServerPassword ? srcdsStore.passwordTV : ''

  srcdsSetDialog.value = true
}

/** 重置服务器配置 */
function srcdsResetStore() {
  srcdsStore.reset()
  steamConnectLink.value = BtnConnectStatus.NEEDPASSWD
  srcdsSetDialog.value = false
}

/** 保存服务器配置 */
function srcdsSaveStore() {
  if (srcdsSetForms.value.password === '') srcdsSetForms.value.password = defaultServerPassword
  if (srcdsSetForms.value.passwordTV === '') srcdsSetForms.value.passwordTV = defaultServerPassword

  srcdsStore.password = srcdsSetForms.value.password
  srcdsStore.passwordTV = srcdsSetForms.value.passwordTV

  srcdsSetDialog.value = false

  if (srcdsStore.password === defaultServerPassword) {
    steamConnectLink.value = BtnConnectStatus.NEEDPASSWD
  } else {
    refreshSteamConnectLink()
  }
}

onMounted(async () => {
  if (srcdsStore.password === defaultServerPassword) {
    steamConnectLink.value = BtnConnectStatus.NEEDPASSWD
  } else {
    refreshSteamConnectLink()
  }
})
</script>
