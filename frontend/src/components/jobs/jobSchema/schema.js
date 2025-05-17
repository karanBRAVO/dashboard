export const job_schema = {
    type: "object",
    properties: {
        metadata: {
            type: "object",
            properties: {
                name: { type: "string", title: "Job Name" },
                namespace: { type: "string", title: "Namespace" },
            },
            required: ["name", "namespace"],
        },
        spec: {
            type: "object",
            properties: {
                minAvailable: { type: "integer", minimum: 0 },
                maxRetry: { type: "integer", minimum: 0 },
                queue: { type: "string" },
                schedulerName: { type: "string" },
                policies: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            event: { type: "string" },
                            action: { type: "string" },
                        },
                    },
                },
                tasks: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            replicas: { type: "integer", minimum: 0 },
                            maxRetry: { type: "integer", minimum: 0 },
                            minAvailable: { type: "integer", minimum: 0 },
                            template: {
                                type: "object",
                                properties: {
                                    spec: {
                                        type: "object",
                                        properties: {
                                            restartPolicy: { type: "string" },
                                            containers: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    properties: {
                                                        name: {
                                                            type: "string",
                                                        },
                                                        image: {
                                                            type: "string",
                                                        },
                                                        command: {
                                                            type: "array",
                                                            items: {
                                                                type: "string",
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};
