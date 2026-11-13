mod camera_proof;

use camera_proof::CameraProof;
use gpui::{Context, Window, WindowOptions, canvas, div, prelude::*, px, rgb};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{
    collections::VecDeque,
    ffi::{CString, c_char, c_void},
    sync::Mutex,
    time::Duration,
};

static EVENTS: Mutex<VecDeque<i32>> = Mutex::new(VecDeque::new());

unsafe extern "C" {
    fn mtgscan_proof_attach(view: *mut c_void);
    fn mtgscan_proof_sync(running: i32, label: *const c_char);
    fn mtgscan_proof_bounds(x: f64, y: f64, width: f64, height: f64);
    fn mtgscan_proof_text_size() -> f64;
}

#[unsafe(no_mangle)]
pub extern "C" fn mtgscan_gate_event(kind: i32) {
    EVENTS.lock().unwrap().push_back(kind);
}

struct Gate {
    camera: CameraProof,
}

impl Gate {
    fn toggle(&mut self, cx: &mut Context<Self>) {
        self.camera.toggle();
        self.sync();
        cx.notify();
    }

    fn sync(&self) {
        unsafe {
            let label = CString::new(self.camera.label()).unwrap();
            mtgscan_proof_sync(self.camera.running().into(), label.as_ptr());
        }
    }
}

impl Render for Gate {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let text_size = unsafe { mtgscan_proof_text_size() } as f32;
        div()
            .size_full()
            .flex()
            .flex_col()
            .justify_end()
            .items_center()
            .pb(window.insets().effective().bottom + px(12.))
            .bg(rgb(0x101622))
            .text_color(rgb(0xf5f7ff))
            .child(
                div()
                    .id("camera-toggle")
                    .relative()
                    .w(px(280.))
                    .h(px((text_size * 2.5).max(52.)))
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded_lg()
                    .bg(rgb(0x246bfd))
                    .text_size(px(text_size))
                    .on_click(cx.listener(|this, _, _, cx| this.toggle(cx)))
                    .child(self.camera.label())
                    .child(
                        canvas(
                            |bounds, _, _| unsafe {
                                mtgscan_proof_bounds(
                                    f32::from(bounds.origin.x).into(),
                                    f32::from(bounds.origin.y).into(),
                                    f32::from(bounds.size.width).into(),
                                    f32::from(bounds.size.height).into(),
                                );
                            },
                            |_, _, _, _| {},
                        )
                        .absolute()
                        .size_full(),
                    ),
            )
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn mtgscan_gpui_main() {
    gpui_platform::application().run(|cx| {
        gpui_ios::ios::set_status_bar_style(gpui_ios::StatusBarContentStyle::Light);
        cx.open_window(WindowOptions::default(), |window, cx| {
            let RawWindowHandle::UiKit(handle) =
                HasWindowHandle::window_handle(window).unwrap().as_raw()
            else {
                panic!("This proof requires UIKit");
            };
            unsafe { mtgscan_proof_attach(handle.ui_view.as_ptr()) };
            cx.new(|cx: &mut Context<Gate>| {
                cx.spawn(async move |this, cx| {
                    loop {
                        cx.background_executor()
                            .timer(Duration::from_millis(100))
                            .await;
                        let events: Vec<_> = EVENTS.lock().unwrap().drain(..).collect();
                        if this
                            .update(cx, |this, cx| {
                                for event in events {
                                    match event {
                                        1 => this.camera.toggle(),
                                        2 => this.camera.foreground(false),
                                        3 => this.camera.foreground(true),
                                        _ => {}
                                    }
                                    this.sync();
                                    cx.notify();
                                }
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                })
                .detach();
                let mut camera = CameraProof::default();
                camera.foreground(true);
                let gate = Gate { camera };
                gate.sync();
                gate
            })
        })
        .unwrap();
        cx.activate(true);
    });
}
