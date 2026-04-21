use std::process::Command;

/// Check if the backend is already running by probing the health endpoint.
fn is_backend_running() -> bool {
    // Use a quick TCP connect check — avoids needing an HTTP client dependency.
    use std::net::TcpStream;
    use std::time::Duration;
    TcpStream::connect_timeout(
        &"127.0.0.1:8765".parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

fn launch_backend() {
    if is_backend_running() {
        println!("Backend already running on :8765, skipping launch.");
        return;
    }

    // Project root inside WSL2 — the Windows path C:\Users\colebienek\projects\agentforge
    // maps to /mnt/c/Users/colebienek/projects/agentforge inside WSL2.
    let wsl_project = "/mnt/c/Users/colebienek/projects/agentforge";

    // Use the venv if it exists, otherwise fall back to system python3.
    // The venv is at {wsl_project}/.venv; system uvicorn is on PATH after pip install.
    let startup_cmd = format!(
        "cd {wsl_project} && \
         if [ -f .venv/bin/uvicorn ]; then \
           source .venv/bin/activate; \
         fi && \
         python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 >> ~/.agentforge/backend.log 2>&1 &"
    );

    Command::new("wsl")
        .args(["-d", "Ubuntu", "--", "/bin/bash", "-c", &startup_cmd])
        .spawn()
        .expect("Failed to launch WSL2 backend");

    // Give the backend a moment to bind the port before the window opens.
    std::thread::sleep(std::time::Duration::from_millis(2000));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    launch_backend();

    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
