import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath("backend"))

from db.session import AsyncSessionLocal
from crud.hardware import fetch_sdr
from weather.manager import map_sdr_config_to_args

async def main():
    async with AsyncSessionLocal() as session:
        # Fetch the SDR
        res = await fetch_sdr(session)
        print("Fetch result:", res)
        if res["success"] and res["data"]:
            for sdr in res["data"]:
                print("SDR Config:", sdr)
                args = map_sdr_config_to_args(sdr)
                print("Mapped args:", args)

if __name__ == "__main__":
    asyncio.run(main())
