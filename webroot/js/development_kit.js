const developmentResponse = {
  '/system/bin/cat /data/adb/rezygisk/state.json': {
    errno: 0,
    stdout: `
      {
        "root": "KernelSU",
        "monitor": {
          "state": "0"
        },
        "rezygiskd": {
          "64": {
            "state": 1,
            "modules": ["immense_cool", "rezygisk_module"]
          },
          "32": {
            "state": 1,
            "modules": ["immense_cool", "rezygisk_module"]
          }
        },
        "zygote": {
          "64": 1,
          "32": 1
        }
      }
    `,
    stderr: ''
  },
  'cat /data/adb/modules/rezygisk/module.prop': {
    errno: 0,
    stdout: 'version=v1.0.0 (505-7e3db00-release)',
    stderr: ''
  },
  '/system/bin/uname -r': {
    errno: 0,
    stdout: '4.19.325-DeepMoonX-d8a7145-128',
    stderr: ''
  },
  '/system/bin/getprop ro.build.version.release': {
    errno: 0,
    stdout: '14',
    stderr: ''
  },
  'module_lister': {
    errno: 0,
    stdout: 'Really Cool Module\n\nSome ReZygisk Module',
    stderr: ''
  },
  'log_lister': {
    errno: 0,
    stdout: `__REZYGISK_LOG_SOURCE__:/data/adb/rezygisk/rezygisk.log
08-05 09:03:45 [12345:12345] I/zygiskd64: ReZygisk daemon started
08-05 09:03:46 [12345:12348] D/zygisk-injector64: Found syscall gadget in vdso
08-05 09:03:47 [12345:12348] W/zygisk-injector64: Retrying queued SIGCONT delivery stop
08-05 09:03:48 [12345:12348] E/zygisk-injector64: Failed to load sample module
__REZYGISK_LOG_SOURCE__:/data/adb/rezygisk/webui_error.log
Error: Example WebUI error for local development`,
    stderr: ''
  },
  '/system/bin/ls /data/adb/modules/rezygisk/webroot/lang': {
    errno: 0,
    stdout: 'ar_EG.json\nde_DE.json\nes_AR.json\nid_ID.json\nja_JP.json\npt_BR.json\ntr_TR.json\nvi_VN.json\nen_US.json\nes_MX.json\nit_IT.json\nko_KR.json\nru_RU.json\nuk_UA.json\nzh_CN.json',
    stderr: ''
  }
}

export function getDevelopmentExecResponse(command) {
  if (developmentResponse[command]) {
    return developmentResponse[command]
  }

  if (command.includes('printf % ; if test -f')) {
    return developmentResponse['module_lister']
  }

  if (command.includes('__REZYGISK_LOG_SOURCE__')) {
    return developmentResponse['log_lister']
  }

  if (command.includes('/system/bin/rm -f /data/adb/rezygisk/rezygisk.log')) {
    return { errno: 0, stdout: '', stderr: '' }
  }

  return { errno: -1, stdout: '', stderr: 'Command not found in development response' }
}
