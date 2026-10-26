//! New, isolated hackathon research spike. Not a show-control engine.
 //! Windows default CPAL output is WASAPI. No ASIO SDK or third-party assets.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample, StreamConfig};
use std::error::Error;
use std::time::Duration;

fn main() -> Result<(), Box<dyn Error>> {
    let host = cpal::default_host();
    println!("Audio host: {:?}", host.id());
    println!("Available output endpoints:");
    let mut count = 0usize;
    for device in host.output_devices()? {
        count += 1;
        let name = device.name().unwrap_or_else(|_| "(nombre no disponible)".into());
        let info = match device.default_output_config() {
            Ok(cfg) => format!("{:?}", cfg),
            Err(err) => format!("config no disponible: {}", err),
        };
        println!("  {}. {} — {}", count, name, info);
    }
    if count == 0 {
        eprintln!("No hay dispositivo de salida disponible; no se reproduce nada.");
        return Ok(());
    }

    // Test audio is opt-in and never starts merely by listing devices.
    if !std::env::args().any(|arg| arg == "--beep") {
        println!("Solo enumeración. Para una prueba audible (volumen bajo): cargo run -- --beep");
        return Ok(());
    }
    let device = host.default_output_device().ok_or("No default output device")?;
    let supported = device.default_output_config()?;
    let sample_format = supported.sample_format();
    let config = supported.config();
    println!("PRUEBA MANUAL: tono de baja amplitud ~0,5 s; no es ASIO ni motor de cues.");
    match sample_format {
        SampleFormat::F32 => beep::<f32>(&device, config)?,
        SampleFormat::I16 => beep::<i16>(&device, config)?,
        SampleFormat::U16 => beep::<u16>(&device, config)?,
        _ => return Err(format!("Formato {:?} no soportado por este spike", sample_format).into()),
    }
    Ok(())
}

fn beep<T>(device: &cpal::Device, config: StreamConfig) -> Result<(), Box<dyn Error>>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    if channels == 0 { return Err("Output stream with zero channels".into()); }
    let sample_rate = config.sample_rate as f32;
    let mut phase = 0f32;
    let phase_step = 440f32 / sample_rate;

    // Real-time callback: NO blocking, disk/network I/O, mutex or allocation.
    let stream = device.build_output_stream(
        config,
        move |output: &mut [T], _callback: &cpal::CallbackInfo| {
            for frame in output.chunks_mut(channels) {
                let value = (phase * std::f32::consts::TAU).sin() * 0.06;
                phase += phase_step;
                if phase >= 1.0 { phase -= 1.0; }
                for sample in frame { *sample = T::from_sample(value); }
            }
        },
        move |error| eprintln!("Salida WASAPI error: {error}"),
        None,
    )?;
    stream.start()?;
    std::thread::sleep(Duration::from_millis(550));
    stream.pause()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn tone_phase_increment_is_valid() {
        let increment = 440.0f32 / 48000.0;
        assert!(increment > 0.0 && increment < 1.0);
    }
}
