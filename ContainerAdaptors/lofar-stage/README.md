# LOFAR staging adaptor

## Functions
This adaptor exposes two functions: stage and status. 

Reachable on `/stage` and `/status` via HTTP, or `functions.lofar.stage` and `functions.lofar.status` via AMQP.

### `stage`
Use the following request payload, with either `id` (observation ID) or `paths` (SURLs):

```json
{
    "cmd": {
        "src": {
            "id": 0000,
            "paths": ["...", "..."]
        },
        "credentials": {
            "lofarUsername": "...",
            "lofarPassword": "..."
        }
    },
    "webhook": {
        "method": "POST",
        "url": "...",
        "headers": {
            "...": "..."
        }    
    }
}
```

### `status`
Use the following request payload:

```json
{
    "cmd": {
        "requestId": "...",
        "credentials": {
            "lofarUsername": "...",
            "lofarPassword": "..."
        }
        
    }
}
```
