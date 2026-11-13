#[derive(Default)]
pub struct CameraProof {
    requested: bool,
    foreground: bool,
}

impl CameraProof {
    pub fn toggle(&mut self) {
        self.requested = !self.requested;
    }

    pub fn foreground(&mut self, active: bool) {
        self.foreground = active;
    }

    pub fn running(&self) -> bool {
        self.requested && self.foreground
    }

    pub fn label(&self) -> &'static str {
        if self.requested {
            "Stop camera"
        } else {
            "Start camera"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::CameraProof;

    #[test]
    fn returning_to_the_foreground_resumes_only_a_requested_camera() {
        let mut proof = CameraProof::default();
        proof.foreground(true);
        assert!(!proof.running());
        proof.toggle();
        assert!(proof.running());
        proof.foreground(false);
        assert!(!proof.running());
        proof.foreground(true);
        assert!(proof.running());
        proof.toggle();
        proof.foreground(false);
        proof.foreground(true);
        assert!(!proof.running());
    }
}
