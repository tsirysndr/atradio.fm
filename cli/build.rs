use std::path::Path;

/// tonic codegen needs `protoc`; the generated code is committed under
/// `src/grpc/` so plain `cargo install atradio` works without protobuf
/// installed — codegen only reruns when protoc is actually available.
fn have_protoc() -> bool {
    if std::env::var_os("PROTOC").is_some() {
        return true;
    }
    std::env::var_os("PATH")
        .is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join("protoc").is_file()))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto");
    if !have_protoc() && Path::new("src/grpc/atradio.v1.rs").exists() {
        return Ok(());
    }
    tonic_build::configure()
        .out_dir("src/grpc")
        .file_descriptor_set_path("src/grpc/descriptor.bin")
        .compile_protos(&["proto/atradio/v1/atradio.proto"], &["proto"])?;
    Ok(())
}
