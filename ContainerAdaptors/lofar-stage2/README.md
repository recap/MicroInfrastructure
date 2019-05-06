# LOFAR Stage (2)

This service provides an API to stage LOFAR data from LTA to dCache.

## Running
Start the service as follows:

```shell
sudo docker run -dt -p 5000:5000 -e LOFAR_USER=ovalker -e LOFAR_PASS=Co9mmuniqu4e lofar-stage2
```

## `/stage`
To stage some data, perform a `POST` request to the `/stage` endpoint with the following payload.

```json
{
  "cmd": {
    "type": "lofar",
    "src": {
      "id": "<sasid>"
    },
    "webhook": {
      "method": "<get|post>",
      "url": "<host>:<port>",
      "headers": [
        "..."
      ]
    }
  }
}
```

The above request will return the staging request id:
```json
{
  "requestId": "<rid>"
}
```

When the staging is finished the webhook is executed (if provided), with payload:
```json
{
  "requestId": "<rid>",
  "surls": [
    "..."
  ]
}
```
