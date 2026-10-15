{{/* Base name for all resources: the release name, e.g. "careslot". */}}
{{- define "careslot.fullname" -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}

{{/* Labels every object carries. */}}
{{- define "careslot.labels" -}}
app.kubernetes.io/part-of: careslot
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/* Selector labels for one component: include "careslot.selector" (list . "backend") */}}
{{- define "careslot.selector" -}}
{{- $root := index . 0 -}}
app.kubernetes.io/name: {{ index . 1 }}
app.kubernetes.io/instance: {{ $root.Release.Name }}
{{- end -}}

{{- define "careslot.image" -}}
{{- $img := index . 0 -}}{{- $root := index . 1 -}}
{{ $img.repository }}:{{ $img.tag | default $root.Chart.AppVersion }}
{{- end -}}

{{- define "careslot.postgresSecret" -}}
{{ include "careslot.fullname" . }}-postgres
{{- end -}}
