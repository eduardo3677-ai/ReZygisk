import { whichCurrentPage } from '../navbar.js'
import { getStrings } from '../pageLoader.js'
import { exec, toast } from '../../kernelsu.js'

async function _getMonitorState() {
  const stateCmd = await exec('/system/bin/cat /data/adb/rezygisk/state.json')
  if (stateCmd.errno !== 0) {
    toast('Error getting state of ReZygisk!')

    return;
  }

  try {
    const ReZygiskState = JSON.parse(stateCmd.stdout)
    return ReZygiskState.monitor.state
  } catch {
    return null;
  }
}

async function _updateDynamicElement() {
  const monitor_status = document.getElementById('monitor_status')
  const strings = await getStrings(whichCurrentPage())
  const monitorState = await _getMonitorState()

  if (monitorState == null) return;

  switch (monitorState) {
    case '0': monitor_status.innerHTML = strings.monitor.status.tracing; break;
    case '1': monitor_status.innerHTML = strings.monitor.status.stopping; break;
    case '2': monitor_status.innerHTML = strings.monitor.status.stopped; break;
    case '3': monitor_status.innerHTML = strings.monitor.status.exiting; break;
    default: monitor_status.innerHTML = strings.monitor.status.unknown;
  }
}

export async function loadOnce() {

}

export async function loadOnceView() {
  _updateDynamicElement()
}

export async function onceViewAfterUpdate() {
  _updateDynamicElement()
}

export async function load() {
  const monitor_start = document.getElementById('monitor_start_button')
  const monitor_stop = document.getElementById('monitor_stop_button')
  const monitor_pause = document.getElementById('monitor_pause_button')
  const monitor_status = document.getElementById('monitor_status')
  const strings = await getStrings(whichCurrentPage())

  monitor_start.addEventListener('click', async () => {
    if (![ strings.monitor.status.tracing, strings.monitor.status.stopping, strings.monitor.status.stopped ].includes(monitor_status.innerHTML)) return;
    monitor_status.innerHTML = strings.monitor.status.tracing
    const res = await exec('/data/adb/modules/rezygisk/bin/zygisk-ptrace64 ctl start')
    if (res.errno !== 0) {
      toast('Failed to start monitor')
      _updateDynamicElement()
    }
  })

  monitor_stop.addEventListener('click', async () => {
    monitor_status.innerHTML = strings.monitor.status.exiting
    const res = await exec('/data/adb/modules/rezygisk/bin/zygisk-ptrace64 ctl exit')
    if (res.errno !== 0) {
      toast('Failed to stop monitor')
      _updateDynamicElement()
    }
  })

  monitor_pause.addEventListener('click', async () => {
    if (![ strings.monitor.status.tracing, strings.monitor.status.stopping, strings.monitor.status.stopped ].includes(monitor_status.innerHTML)) return;
    monitor_status.innerHTML = strings.monitor.status.stopped
    const res = await exec('/data/adb/modules/rezygisk/bin/zygisk-ptrace64 ctl stop')
    if (res.errno !== 0) {
      toast('Failed to pause monitor')
      _updateDynamicElement()
    }
  })

  return;
}