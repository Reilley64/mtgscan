import asyncio

import httpx


async def download(items, directory, user_agent):
    directory.mkdir(parents=True, exist_ok=True)
    pending = [item for item in items if not (directory / f"{item['id']}.jpg").exists()]
    semaphore = asyncio.Semaphore(8)
    failures = []

    async def fetch(client, item):
        async with semaphore:
            for attempt in range(4):
                try:
                    response = await client.get(item["image"])
                    if response.status_code == 200:
                        target = directory / f"{item['id']}.jpg"
                        target.with_suffix(".tmp").write_bytes(response.content)
                        target.with_suffix(".tmp").rename(target)
                        return
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(2**attempt)
            failures.append(item["id"])

    async with httpx.AsyncClient(headers={"User-Agent": user_agent, "Accept": "image/*"}, timeout=30) as client:
        await asyncio.gather(*(fetch(client, item) for item in pending))
    return failures
