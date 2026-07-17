# Template formula for the `tsirysndr/homebrew-tap` repo.
# Copy this to your tap as `Formula/atradio.rb` and fill in the sha256 values
# (from the `*.tar.gz.sha256` files attached to each GitHub release), or wire an
# action that bumps `version` + sha256 on every release.
class Atradio < Formula
  desc "A TUI radio player on the AT Protocol"
  homepage "https://github.com/tsirysndr/atradio.fm"
  version "0.3.0"
  license "GPL-2.0-or-later"

  on_macos do
    on_arm do
      url "https://github.com/tsirysndr/atradio.fm/releases/download/v#{version}/atradio-v#{version}-macos-aarch64.tar.gz"
      sha256 "REPLACE_WITH_MACOS_AARCH64_SHA256"
    end
    on_intel do
      url "https://github.com/tsirysndr/atradio.fm/releases/download/v#{version}/atradio-v#{version}-macos-amd64.tar.gz"
      sha256 "REPLACE_WITH_MACOS_AMD64_SHA256"
    end
  end

  on_linux do
    depends_on "alsa-lib"
    on_arm do
      url "https://github.com/tsirysndr/atradio.fm/releases/download/v#{version}/atradio-v#{version}-linux-aarch64.tar.gz"
      sha256 "REPLACE_WITH_LINUX_AARCH64_SHA256"
    end
    on_intel do
      url "https://github.com/tsirysndr/atradio.fm/releases/download/v#{version}/atradio-v#{version}-linux-amd64.tar.gz"
      sha256 "REPLACE_WITH_LINUX_AMD64_SHA256"
    end
  end

  def install
    bin.install "atradio"
  end

  test do
    assert_match "atradio", shell_output("#{bin}/atradio --version")
  end
end
