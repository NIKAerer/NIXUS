//! Mémoire et processeur pris par NIXUS (le programme + ses processus WebView2), pour le compteur de Paramètres.

use std::sync::Mutex;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

pub struct Usage(Mutex<System>);

impl Usage {
    pub fn new() -> Self {
        Usage(Mutex::new(System::new()))
    }

    /// (Mo, % du processeur total). Le processeur se calcule entre deux mesures : la première renvoie 0.
    pub fn measure(&self) -> (u64, f32) {
        let Ok(mut sys) = self.0.lock() else { return (0, 0.0) };
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_memory().with_cpu());
        let Ok(me) = sysinfo::get_current_pid() else { return (0, 0.0) };
        let mut mine: Vec<Pid> = vec![me];
        let mut i = 0;
        while i < mine.len() {
            let parent = mine[i];
            for (pid, p) in sys.processes() {
                if p.parent() == Some(parent) && !mine.contains(pid) {
                    mine.push(*pid);
                }
            }
            i += 1;
        }
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
        let (mut mem, mut cpu) = (0u64, 0f32);
        for pid in &mine {
            if let Some(p) = sys.process(*pid) {
                mem += p.memory();
                cpu += p.cpu_usage();
            }
        }
        (mem / 1_048_576, cpu / cores)
    }
}
