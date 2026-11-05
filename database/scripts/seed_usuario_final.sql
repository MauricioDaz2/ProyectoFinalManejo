USE [BD_COOPERATIVAS_BUSES];
GO

IF EXISTS (
    SELECT 1
    FROM dbo.USUARIOS
    WHERE ID_USU = 'USUFINAL1'
       OR COR_USU = 'usuario.final@transporte.ec'
)
BEGIN
    UPDATE dbo.USUARIOS
    SET NOM_USU = 'Usuario',
        APE_USU = 'Final',
        COR_USU = 'usuario.final@transporte.ec',
        CON_USU = 'Usuario123!',
        TEL_USU = '0999999999',
        FEC_REG_USU = CONVERT(date, GETDATE()),
        EST_USU = '1',
        ID_ROL_PER = 'R005',
        ID_COP_PER = NULL,
        CED_USU = '1712345678'
    WHERE ID_USU = 'USUFINAL1'
       OR COR_USU = 'usuario.final@transporte.ec';
END
ELSE
BEGIN
    INSERT INTO dbo.USUARIOS
        (ID_USU, NOM_USU, APE_USU, COR_USU, CON_USU, TEL_USU, CED_USU,
         FEC_REG_USU, EST_USU, ID_ROL_PER, ID_COP_PER)
    VALUES
        ('USUFINAL1', 'Usuario', 'Final', 'usuario.final@transporte.ec',
         'Usuario123!', '0999999999', '1712345678', CONVERT(date, GETDATE()), '1', 'R005', NULL);
END;
GO
