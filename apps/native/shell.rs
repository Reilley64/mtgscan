mod tokens;

use gpui::{Context, Window, WindowOptions, canvas, div, prelude::*, px, rgb};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::ffi::{CString, c_char, c_void};

unsafe extern "C" {
    fn mtgscan_auth_attach(view: *mut c_void);
    fn mtgscan_auth_bounds(x: f64, y: f64, width: f64, height: f64);
    fn mtgscan_auth_text_size() -> f64;
    fn mtgscan_auth_open_url(url: *const c_char);
}

mod atoms {
    use super::*;

    pub fn title(text_size: f32) -> impl IntoElement {
        div()
            .text_size(px(text_size))
            .text_color(rgb(tokens::TEXT))
            .child("mtgscan")
    }
}

mod molecules {
    use super::*;

    pub fn brand(text_size: f32) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .gap(px(tokens::SM))
            .child(atoms::title(text_size))
    }
}

mod organisms {
    use super::*;

    pub fn authentication() -> impl IntoElement {
        div().flex_1().w_full().child(
            canvas(
                |bounds, _, _| unsafe {
                    mtgscan_auth_bounds(
                        f32::from(bounds.origin.x).into(),
                        f32::from(bounds.origin.y).into(),
                        f32::from(bounds.size.width).into(),
                        f32::from(bounds.size.height).into(),
                    );
                },
                |_, _, _, _| {},
            )
            .size_full(),
        )
    }
}

mod templates {
    use super::*;

    pub fn account_page(window: &Window) -> impl IntoElement {
        let size = unsafe { mtgscan_auth_text_size() } as f32;
        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(rgb(tokens::BACKGROUND))
            .pt(window.insets().effective().top + px(tokens::LG))
            .pb(window.insets().effective().bottom)
            .px(px(tokens::LG))
            .gap(px(tokens::LG))
            .child(molecules::brand(size))
            .child(organisms::authentication())
    }
}

struct AccountPage;

impl Render for AccountPage {
    fn render(&mut self, window: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        templates::account_page(window)
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn mtgscan_gpui_main() {
    let application = gpui_platform::application();
    application.on_open_urls(|urls| {
        for url in urls {
            if let Ok(value) = CString::new(url) {
                unsafe { mtgscan_auth_open_url(value.as_ptr()) };
            }
        }
    });
    application.run(|cx| {
        gpui_ios::ios::set_status_bar_style(gpui_ios::StatusBarContentStyle::Light);
        cx.open_window(WindowOptions::default(), |window, cx| {
            let RawWindowHandle::UiKit(handle) =
                HasWindowHandle::window_handle(window).unwrap().as_raw()
            else {
                panic!("The mobile shell requires UIKit");
            };
            unsafe { mtgscan_auth_attach(handle.ui_view.as_ptr()) };
            cx.new(|_| AccountPage)
        })
        .unwrap();
        cx.activate(true);
    });
}
