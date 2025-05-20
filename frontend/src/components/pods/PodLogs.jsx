import { useState } from "react";
import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";

const PodLogs = ({ openDialog, onClose, pod, podYaml }) => {
    const [containerName, setContainerName] = useState("");
    const [logs, setLogs] = useState("");
    const [loading, setLoading] = useState(false);

    const handleContainerNameChange = (event) => {
        setContainerName(event.target.value);
    };

    const fetchLogs = async () => {
        const { name, namespace } = pod?.metadata;
        if (!name || !namespace || !containerName) {
            console.error("Pod name or namespace or container is missing");
            return;
        }

        setLoading(true);
        setLogs("");

        try {
            const source = new EventSource(
                `/api/pod/logs?namespace=${namespace}&pod=${name}&container=${containerName}`,
            );

            source.onmessage = (e) => {
                setLogs((prev) => prev + e.data + "\n");
            };

            source.onerror = () => {
                console.error("SSE error");
                source.close();
            };
        } catch (err) {
            console.error("Failed to fetch logs: " + err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Dialog
                open={openDialog}
                onClose={onClose}
                scroll="paper"
                fullScreen
            >
                <DialogTitle
                    sx={{
                        display: "flex",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <Typography variant="body" component={"span"}>
                        {pod?.metadata?.name}
                    </Typography>
                    <Tooltip title="Namespace">
                        <Typography
                            variant="caption"
                            component={"span"}
                            sx={{
                                border: "2px solid rgb(227, 76, 38)",
                                borderRadius: "5px",
                                padding: "5px",
                                background: "rgb(227, 76, 38)",
                                color: "white",
                            }}
                        >
                            {pod?.metadata?.namespace}
                        </Typography>
                    </Tooltip>
                </DialogTitle>
                <DialogContent>
                    <div>
                        <Typography variant="h5">Pod Info</Typography>
                        <Divider
                            sx={{ background: "gray", margin: "0 0 10px 0" }}
                        />
                        <Info
                            title={"Start Time: "}
                            value={new Date(
                                pod?.status?.startTime,
                            ).toLocaleString()}
                        />
                        <Info
                            title={"Nodename: "}
                            value={pod?.spec?.nodeName}
                        />
                        {pod?.metadata?.labels && (
                            <>
                                <Info
                                    title={"Job Name: "}
                                    value={
                                        pod?.metadata?.labels[
                                            "volcano.sh/job-name"
                                        ]
                                    }
                                />
                                <Info
                                    title={"Job Namespace: "}
                                    value={
                                        pod?.metadata?.labels[
                                            "volcano.sh/job-namespace"
                                        ]
                                    }
                                />
                                <Info
                                    title={"Queue: "}
                                    value={
                                        pod?.metadata?.labels[
                                            "volcano.sh/queue-name"
                                        ]
                                    }
                                />
                            </>
                        )}
                        <Typography variant="h5">Network Info</Typography>
                        <Divider
                            sx={{ background: "gray", margin: "0 0 10px 0" }}
                        />
                        <Info title={"Host IP: "} value={pod?.status?.hostIP} />
                        <Info
                            title={"DNS Policy: "}
                            value={pod?.spec?.dnsPolicy}
                        />
                    </div>
                    <Typography variant="h5">Container Info</Typography>
                    <Divider
                        sx={{ background: "gray", margin: "0 0 10px 0" }}
                    />
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Volumes</TableCell>
                                <TableCell>Image</TableCell>
                                <TableCell>Restart Count</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pod?.spec?.containers?.map((container) => {
                                let containerStatus = "Unknown";
                                let containerRestartCount = -1;
                                pod?.status?.containerStatuses?.forEach(
                                    (contStatus) => {
                                        if (
                                            contStatus.name === container.name
                                        ) {
                                            containerStatus = Object.keys(
                                                contStatus.state,
                                            )[0];
                                            containerRestartCount =
                                                contStatus.restartCount;
                                        }
                                    },
                                );
                                return (
                                    <TableRow key={container.name}>
                                        <TableCell>
                                            <input
                                                type="radio"
                                                value={container.name}
                                                checked={
                                                    containerName ===
                                                    container.name
                                                }
                                                name="containerRadioGroup"
                                                onChange={
                                                    handleContainerNameChange
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>{container?.name}</TableCell>
                                        <TableCell>
                                            {container?.volumeMounts?.length}
                                        </TableCell>
                                        <TableCell>
                                            {container?.image}
                                        </TableCell>
                                        <TableCell>
                                            {containerRestartCount}
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: "100px" }}>
                                            {containerStatus}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    <Typography
                        variant="subtitle1"
                        sx={{
                            display: "flex",
                            flexDirection: "row",
                            justifyContent: "flex-start",
                            alignItems: "center",
                            gap: "10px",
                        }}
                    >
                        <Typography variant="inherit">Logs</Typography>
                        <Typography variant="caption" component={"span"}>
                            {"("} Select the container to see its logs {")"}
                        </Typography>
                    </Typography>
                    <pre
                        style={{
                            width: "100%",
                            color: "white",
                            background: "black",
                            height: "400px",
                            padding: "5px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordWrap: "break-word",
                            fontFamily: "monospace",
                            fontSize: "14px",
                            lineHeight: "1.5",
                        }}
                    >
                        {!containerName ? (
                            <>Select a container</>
                        ) : loading ? (
                            <CircularProgress />
                        ) : !logs ? (
                            <button onClick={fetchLogs}>Fetch Logs</button>
                        ) : (
                            <>
                                Showing log for Container: {containerName}
                                <br />
                                {logs}
                            </>
                        )}
                    </pre>

                    <Typography variant="h5">Pod YAML</Typography>
                    <Divider
                        sx={{ background: "gray", margin: "0 0 10px 0" }}
                    />
                    <pre
                        dangerouslySetInnerHTML={{
                            __html: podYaml,
                        }}
                        style={{
                            width: "100%",
                            color: "black",
                            background: "white",
                            height: "400px",
                            padding: "5px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordWrap: "break-word",
                            fontFamily: "monospace",
                            fontSize: "14px",
                            lineHeight: "1.5",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

const Info = ({ title, value }) => {
    return (
        <>
            <Typography>
                <Typography component={"span"}>{title}</Typography>
                <Typography component={"span"}>{value}</Typography>
            </Typography>
        </>
    );
};

export default PodLogs;
