Name:           atradio
Version:        0.5.3
Release:        1%{?dist}
Summary:        A TUI radio player on the AT Protocol

License:        GPLv2+
URL:            https://github.com/tsirysndr/atradio.fm

BuildArch:      x86_64

Requires: glibc, alsa-lib

%description
atradio brings atradio.fm to your terminal: browse trending / popular stations,
fuzzy-search the whole radio-browser directory, play live streams with a full
Rockbox DSP/equalizer chain, and — when signed in — favorite stations and post
comments to your own PDS. On Linux the player is exposed over MPRIS for
media-key and desktop integration.

%prep
# Nothing to prep — the binary is prebuilt.

%build
# Nothing to build — the binary is prebuilt.

%install
mkdir -p %{buildroot}/usr/local/bin
cp -r %{_sourcedir}/amd64/usr %{buildroot}/

%files
/usr/local/bin/atradio

%post
if [ "$1" -eq 1 ]; then
    echo "atradio: installed. Launch it with:  atradio"
fi
