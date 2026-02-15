<template>
  <div class="min-h-screen w-full flex flex-col items-center justify-center">
    <div class="flex-1 flex flex-col items-center justify-center">
      <Image :src="FavIcon" alt="FavIcon" width="256" height="256" />

      <h3>由 {{ serverProvider }} 提供的</h3>
      <h1 class="text-4xl">{{ serverName }} 服务器</h1>

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

        <template v-if="protocol === 'http:' || protocol === 'https:'">
          <a>&nbsp;|&nbsp;</a>
          <a class="underline" :href="appDownUrl" target="_blank">下载客户端</a>
        </template>

        <a>&nbsp;|&nbsp;</a>
        <a class="underline cursor-pointer" @click="srcdsOpenDialog">设置服务器密码</a>
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
          v-model="srcdsPasswordValue"
          :feedback="false"
          fluid
          toggleMask
        />
        <label for="set_srcds_password">服务器密码</label>
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
import { DNSError, getDNSStatusMessage, resolveHostToIPv4 } from '@/dns'
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
const srcds = useSrcdsStore()
const protocol = window.location.protocol

// 环境变量
const serverProvider = import.meta.env.VITE_SRCDS_SERVER_PROVIDER ?? '好心人'
const serverName = import.meta.env.VITE_SRCDS_SERVER_NAME ?? 'Counter-Strike 2'
const serverAddr = import.meta.env.VITE_SRCDS_SERVER_ADDRESS ?? 'example.com'
const serverPort = import.meta.env.VITE_SRCDS_SERVER_PORT ?? '27015'

// APP 下载链接
const appDownUrl = `https://github.com/${/^[A-Za-z]+$/.test(serverProvider) ? serverProvider : 'GitHub'}/cs2-server-introduce/releases/latest`

// 服务器连接协议链接
const steamConnectLink: Ref<BtnConnectStatus | string> = ref(BtnConnectStatus.RESOLVING)
const steamConnectDialog = ref(false)

// 设置密码
const srcdsSetDialog = ref(false)
const srcdsPasswordValue = ref('')

// 按钮样式
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
        click: srcdsOpenDialog,
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

/**
 * 生成Steam服务器连接的渐进式连接
 * @param address 地址
 * @param port 端口
 * @param password 密码
 */
async function generateSteamBrowserProtocol(
  address: string,
  port?: string,
  password?: string,
): Promise<string> {
  const ip = await resolveHostToIPv4(address)

  let url = `steam://connect/${ip}`

  if (port) {
    url += `:${port}`
  }

  if (password) {
    url += `/${encodeURIComponent(password)}`
  }

  return url
}

/**
 * 刷新渐进式连接
 */
async function refreshSteamConnectLink() {
  try {
    steamConnectLink.value = BtnConnectStatus.RESOLVING
    const password = srcds.password !== defaultServerPassword ? srcds.password : undefined
    steamConnectLink.value = await generateSteamBrowserProtocol(serverAddr, serverPort, password)
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
 * 运行服务器连接协议链接
 */
function launchSteamConnectLink() {
  if (typeof steamConnectLink.value !== 'string') return

  steamConnectDialog.value = true

  setTimeout(() => {
    if (typeof steamConnectLink.value !== 'string') return
    window.location.href = steamConnectLink.value
  }, 500)
}

/** 打开服务器信息编辑对话框 */
function srcdsOpenDialog() {
  srcdsPasswordValue.value = srcds.password !== defaultServerPassword ? srcds.password : ''
  srcdsSetDialog.value = true
}

/** 重置服务器信息 */
function srcdsResetStore() {
  srcds.reset()
  steamConnectLink.value = BtnConnectStatus.NEEDPASSWD
  srcdsSetDialog.value = false
}

/** 保存服务器信息 */
function srcdsSaveStore() {
  if (srcdsPasswordValue.value === '') srcdsPasswordValue.value = defaultServerPassword

  srcds.password = srcdsPasswordValue.value
  srcdsPasswordValue.value = srcds.password !== defaultServerPassword ? srcds.password : ''
  srcdsSetDialog.value = false

  if (srcds.password === defaultServerPassword) {
    steamConnectLink.value = BtnConnectStatus.NEEDPASSWD
  } else {
    refreshSteamConnectLink()
  }
}

onMounted(async () => {
  if (srcds.password === defaultServerPassword) {
    steamConnectLink.value = BtnConnectStatus.NEEDPASSWD
  } else {
    refreshSteamConnectLink()
  }

  document.title = `由 ${serverProvider} 提供的 ${serverName} 服务器`
})
</script>
