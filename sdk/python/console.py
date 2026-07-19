"""Interactive IPython console for the atradio Python SDK.

    cd sdk/python
    ./build.sh                      # build the native lib once
    uv run --group console console.py

Drops you into IPython with ``AppView``, ``Agent``, and ``favorite_rkey``
already imported, plus a ready-to-use unauthenticated ``AppView`` bound to
``av`` — so you can poke at the live SDK straight away:

    In [1]: av.recent_stations(3)
    In [2]: favorite_rkey("rb:...")
"""

import atradio
from atradio import Agent, AppView, favorite_rkey

BANNER = (
    "atradio Python SDK console\n"
    "  av              — an unauthenticated AppView (reads)\n"
    "  AppView, Agent, favorite_rkey — imported\n"
    "  try: av.recent_stations(5)\n"
)


def main() -> None:
    try:
        from IPython import start_ipython
    except ImportError:
        raise SystemExit(
            "IPython is not installed. Run this console with:\n"
            "    uv run --group console console.py"
        )

    ns = {
        "atradio": atradio,
        "AppView": AppView,
        "Agent": Agent,
        "favorite_rkey": favorite_rkey,
        "av": AppView(None),  # None → default AppView base URL
    }
    print(BANNER)
    start_ipython(argv=[], user_ns=ns, display_banner=False)


if __name__ == "__main__":
    main()
